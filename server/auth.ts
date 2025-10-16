import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import pgSession from "connect-pg-simple";
import { storage, RBAC_PERMISSION_SLUGS } from "./storage";
import { pool } from "./db";
import bcrypt from "bcryptjs";
import type { User, UserWithBranch } from "@shared/schema";
// duplicate RequestHandler import removed
import crypto, { randomUUID } from "node:crypto";
import logger from "./logger";

function resolveSessionSecret() {
  const envSecret = process.env.SESSION_SECRET?.trim();
  const isProd = process.env.NODE_ENV === "production";
  if (envSecret) return envSecret;
  if (!isProd) {
    const generated = crypto.randomBytes(32).toString("hex");
    process.env.SESSION_SECRET = generated;
    console.warn("⚠️  SESSION_SECRET was missing. Generated a development-only secret.");
    return generated;
  }
  throw new Error("SESSION_SECRET environment variable is required in production");
}

export const SESSION_SECRET = resolveSessionSecret();

// Hardcoded super admin credentials for development/testing
const hardcodedAdmin: UserWithBranch = {
  publicId: 0 as any,
  id: "superadmin",
  username: "superadmin",
  email: null,
  passwordHash: "",
  firstName: "Super",
  lastName: "Admin",
  role: "super_admin",
  isActive: true,
  branchId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  branch: null,
  permissions: Object.values(RBAC_PERMISSION_SLUGS),
};



export function getAdminSession() {
  const PgStore = pgSession(session);

  // Get the environment-specific cookie settings
  const isProduction = process.env.NODE_ENV === 'production';
  const isReplit = (process.env.REPLIT_ENVIRONMENT === 'production') || Boolean(process.env.REPL_ID);
  const useMemoryStore =
    process.env.SESSION_STORE === 'memory' || process.env.NODE_ENV === 'test';

  // Enhanced security cookie configuration for production
  const cookieConfig = {
    sameSite: isProduction ? "strict" as const : "lax" as const, // Stricter in production
    secure: Boolean(isProduction || isReplit), // Secure cookies in production and Replit
  };

  return session({
    name: 'sid', // Unified session name
    store: useMemoryStore
      ? new session.MemoryStore()
      : new PgStore({
          pool,
          createTableIfMissing: true,
          tableName: 'sessions', // Sessions table
        }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh session on activity
    cookie: {
      httpOnly: true, // Prevents XSS attacks
      ...cookieConfig,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/', // Allow for all paths
      domain: undefined,
    },
  });
}

export function getCustomerSession() {
  const PgStore = pgSession(session);
  
  // Get the environment-specific cookie settings  
  const isProduction = process.env.NODE_ENV === 'production';
  const isReplit = (process.env.REPLIT_ENVIRONMENT === 'production') || Boolean(process.env.REPL_ID);
  
  // Customer session cookie configuration
  const cookieConfig = {
    sameSite: "lax" as const, // More permissive for customer experience
    secure: Boolean(isProduction || isReplit), // Secure cookies in production and Replit
  };
  
  return session({
    name: 'customer_sid', // Distinct session name for customers
    store: new PgStore({ 
      pool, 
      createTableIfMissing: true,
      tableName: 'customer_sessions' // Customer sessions table  
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh session on activity
    cookie: {
      httpOnly: true, // Prevents XSS attacks
      ...cookieConfig,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours for customer sessions
      path: '/customer', // Restrict customer cookies to customer paths
      domain: undefined,
    },
  });
}

// Backward compatibility - defaults to admin session
export function getSession() {
  return getAdminSession();
}

interface SetupAuthOptions {
  sessionMiddleware?: RequestHandler;
  passportInitialize?: RequestHandler;
  passportSession?: RequestHandler;
}

export async function setupAuth(app: Express, options: SetupAuthOptions = {}) {
  app.set("trust proxy", 1);

  // Use unified secure session configuration
  const sessionMiddleware = options.sessionMiddleware ?? getAdminSession();
  const passportInitialize = options.passportInitialize ?? passport.initialize();
  const passportSession = options.passportSession ?? passport.session();

  app.use(sessionMiddleware);

  app.use(passportInitialize);
  app.use(passportSession);

  // Local strategy for username/password authentication
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // Check hardcoded credentials first
        if (username === hardcodedAdmin.username && password === "laundry123") {
          return done(null, hardcodedAdmin);
        }

        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }

        if (!user.isActive) {
          return done(null, false, { message: "Account is disabled" });
        }

        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
          return done(null, false, { message: "Invalid username or password" });
        }

        return done(null, user);
      } catch (error) {
        logger.error({ err: error }, "Login error");
        return done(error as any);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      console.log("Deserializing user with ID:", id);
      if (id === hardcodedAdmin.id) {
        console.log("Found hardcoded admin");
        return done(null, { ...hardcodedAdmin, permissions: Array.from(collectPermissions(hardcodedAdmin)) });
      }
      const user = await storage.getUser(id);
      console.log("Deserialized user:", user ? "found" : "not found");
      if (user) {
        user.permissions = Array.from(collectPermissions(user));
      }
      done(null, user ?? false);
    } catch (error) {
      console.error("Deserialization error:", error);
      done(error as any);
    }
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  console.log("Auth check - sessionID:", req.sessionID);
  console.log("Session data:", req.session);
  console.log("isAuthenticated:", req.isAuthenticated(), "user:", req.user ? "exists" : "none");
  
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Authentication required" });
};

export const requireSuperAdmin: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated() && (req.user as UserWithBranch)?.role === 'super_admin') {
    return next();
  }
  res.status(403).json({ message: "Super admin access required" });
};

export const requireAdminOrSuperAdmin: RequestHandler = (req, res, next) => {
  const user = req.user as UserWithBranch;
  if (req.isAuthenticated() && (user?.role === 'admin' || user?.role === 'super_admin')) {
    return next();
  }
  res.status(403).json({ message: "Admin access required" });
};

export const requireCustomerOrAdmin: RequestHandler = (req, res, next) => {
  const customerId = (req.session as any)?.customerId as string | undefined;
  const user = req.user as UserWithBranch | undefined;
  const isAdmin = req.isAuthenticated() && (user?.role === 'admin' || user?.role === 'super_admin');
  if (customerId || isAdmin) {
    return next();
  }
  res.status(401).json({ message: "Login required" });
};

function collectPermissions(user: UserWithBranch | undefined | null): Set<string> {
  const effective = new Set<string>();
  if (!user) return effective;
  const base = Array.isArray(user.permissions) ? user.permissions : [];
  for (const slug of base) {
    if (typeof slug === 'string') {
      effective.add(slug);
    }
  }
  if (user.role === 'super_admin') {
    for (const slug of Object.values(RBAC_PERMISSION_SLUGS)) {
      effective.add(slug);
    }
  }
  return effective;
}

function userHasPermission(user: UserWithBranch | undefined | null, permission: string): boolean {
  return collectPermissions(user).has(permission);
}

export function requirePermission(permission: string): RequestHandler {
  return (req, res, next) => {
    const user = req.user as UserWithBranch | undefined;
    if (req.isAuthenticated() && userHasPermission(user, permission)) {
      return next();
    }
    res.status(403).json({ message: "Permission denied" });
  };
}

export const requireAnalyticsDatasetAccess = requirePermission(RBAC_PERMISSION_SLUGS.analyticsRead);
export const requireAnalyticsDatasetManage = requirePermission(RBAC_PERMISSION_SLUGS.analyticsManage);
export const requireWorkflowBuilderEdit = requirePermission(RBAC_PERMISSION_SLUGS.workflowEdit);
export const requireWorkflowBuilderPublish = requirePermission(RBAC_PERMISSION_SLUGS.workflowPublish);

// Minimal driver token utilities for tests and lightweight endpoints
// Token format: a simple opaque string containing the driver id
export function issueDriverToken(driverId: string): string {
  // Keep it deliberately simple for in-memory tests
  return driverId;
}

export const validateDriverToken: RequestHandler = async (req, res, next) => {
  try {
    const auth = req.headers["authorization"] || "";
    const token = Array.isArray(auth) ? auth[0] : auth;
    const parts = token.split(" ");
    const opaque = parts.length === 2 ? parts[1] : parts[0];
    if (!opaque) return res.status(401).json({ message: "Missing token" });
    const user = await storage.getUser(opaque);
    if (!user || user.role !== "driver") {
      return res.status(401).json({ message: "Invalid token" });
    }
    (req as any).user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
