# syntax=docker/dockerfile:1

ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app

# Install all deps for development (includes devDependencies)
FROM base AS deps-dev
COPY package*.json ./
RUN npm ci

# Install production-only deps for slim runtime if needed
FROM base AS deps-prod
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev

# Development image with hot reload
FROM deps-dev AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]

# Build client assets for production serving
FROM deps-dev AS build
ENV NODE_ENV=production
COPY . .
RUN npx vite build

# Runtime: run server via tsx and serve built client assets
FROM deps-dev AS runtime
ENV NODE_ENV=production
COPY . .
COPY --from=build /app/dist ./dist
EXPOSE 5000
CMD ["node", "--import", "tsx", "server/index.ts"]
