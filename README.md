# FlutterPos

## Environment Variables

Copy `.env.example` to `.env` and fill in your own values:

```bash
cp .env.example .env
```

The following variables are required:

- `DATABASE_URL`: PostgreSQL connection string. When using Neon, include `sslmode=require&channel_binding=require` in the URL.
- `SESSION_SECRET`: secret key for signing session cookies.
- `NODE_ENV`: either `development` or `production`.

## Database Setup

Generate and run migrations before starting the app:

```bash
npm run db:generate
npm run db:migrate
```

## Development

Start the development server:

```bash
npm run dev
```

The application seeds default data on first run, including a `superadmin` user with password `admin123`.

## Local Dev

1. Copy envs:
   ```bash
   cp .env.example .env
   ```

2. Start Postgres (via Docker) or your own local instance:

   ```bash
   docker compose up -d db
   ```

3. Install deps:

   ```bash
   npm install
   ```

4. Generate & run migrations:

   ```bash
   npm run db:generate
   npm run db:prepare
   ```

5. (Optional) Seed:

   ```bash
   npm run db:seed
   ```

6. Start the dev server:

   ```bash
   npm run dev
   ```

Troubleshooting:

* If you see `ECONNREFUSED ::1:5432` or `127.0.0.1:5432`, Postgres isn’t accepting connections.
* In development, a missing `SESSION_SECRET` will generate an ephemeral secret and log a warning.
* Node v24 can be bleeding edge. If dependencies misbehave, use Node 20 LTS (`nvm use 20`).

