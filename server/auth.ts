import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import pgSession from "connect-pg-simple";
import { storage } from "./storage";
import { pool } from "./db";
import bcrypt from "bcryptjs";
import type { User } from "@shared/schema";
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
const hardcodedAdmin: User = {
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
};



export function getAdminSession() {
  const PgStore = pgSession(session);
  
  // Get the environment-specific cookie settings
  const isProduction = process.env.NODE_ENV === 'production';
  const isReplit = process.env.REPLIT_ENVIRONMENT === 'production' || process.env.REPL_ID;
  
  // Enhanced security cookie configuration for production
  const cookieConfig = {
    sameSite: isProduction ? "strict" as const : "lax" as const, // Stricter in production
    secure: isProduction || isReplit, // Secure cookies in production and Replit
  };
  
  return session({
    name: 'sid', // Unified session name 
    store: new PgStore({ 
      pool, 
      createTableIfMissing: true,
      tableName: 'sessions' // Sessions table
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
  const isReplit = process.env.REPLIT_ENVIRONMENT === 'production' || process.env.REPL_ID;
  
  // Customer session cookie configuration
  const cookieConfig = {
    sameSite: "lax" as const, // More permissive for customer experience
    secure: isProduction || isReplit, // Secure cookies in production and Replit
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

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  
  // Use unified secure session configuration
  app.use(getAdminSession());
  
  app.use(passport.initialize());
  app.use(passport.session());

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
        logger.error(`Login error:`, error);
        return done(error);
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
        return done(null, hardcodedAdmin);
      }
      const user = await storage.getUser(id);
      console.log("Deserialized user:", user ? "found" : "not found");
      done(null, user);
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
  if (req.isAuthenticated() && (req.user as User)?.role === 'super_admin') {
    return next();
  }
  res.status(403).json({ message: "Super admin access required" });
};

export const requireAdminOrSuperAdmin: RequestHandler = (req, res, next) => {
  const user = req.user as User;
  if (req.isAuthenticated() && (user?.role === 'admin' || user?.role === 'super_admin')) {
    return next();
  }
  res.status(403).json({ message: "Admin access required" });
};

export const requireCustomerOrAdmin: RequestHandler = (req, res, next) => {
  const customerId = (req.session as any)?.customerId as string | undefined;
  const user = req.user as User;
  const isAdmin = req.isAuthenticated() && (user?.role === 'admin' || user?.role === 'super_admin');
  if (customerId || isAdmin) {
    return next();
  }
  res.status(401).json({ message: "Login required" });
};

