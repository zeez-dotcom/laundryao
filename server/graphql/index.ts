import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageProductionDefault,
} from "@apollo/server/plugin/landingPage/default";
import type { Express, RequestHandler } from "express";
import type { Server } from "http";
import type { UserWithBranch } from "@shared/schema";
import type { IStorage } from "../storage";
import type { WorkflowEngine } from "../services/workflows/engine";
import { typeDefs } from "./schema";
import {
  createLoaders,
  createResolvers,
  type CreateResolversOptions,
  type GraphqlContext,
  type GraphqlServices,
} from "./resolvers";

interface RegisterGraphqlOptions {
  app: Express;
  httpServer: Server;
  storage: IStorage;
  workflowEngine: WorkflowEngine;
  requireAuth: RequestHandler;
  services: GraphqlServices;
}

export async function registerGraphql(options: RegisterGraphqlOptions): Promise<ApolloServer<GraphqlContext>> {
  const { app, httpServer, storage, workflowEngine, requireAuth, services } = options;

  const resolvers = createResolvers({ storage, workflowEngine, services } satisfies CreateResolversOptions);

  const apollo = new ApolloServer<GraphqlContext>({
    typeDefs,
    resolvers,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      process.env.NODE_ENV === "production"
        ? ApolloServerPluginLandingPageProductionDefault({ footer: false })
        : ApolloServerPluginLandingPageLocalDefault({ footer: false }),
    ],
  });

  await apollo.start();

  app.use(
    "/graphql",
    requireAuth,
    expressMiddleware(apollo, {
      context: async ({ req }): Promise<GraphqlContext> => {
        const user = req.user as UserWithBranch | undefined;
        const tenantId = (req as any).tenantId ?? user?.branchId ?? null;
        return {
          user,
          tenantId,
          storage,
          services,
          loaders: createLoaders({ storage, services, branchId: tenantId ?? undefined }),
        };
      },
    }),
  );

  return apollo;
}

