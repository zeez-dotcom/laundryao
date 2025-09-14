import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
// @ts-ignore
import compression from "compression";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import logger from "./logger";
import { NotificationService } from "./services/notification";
import { assertDbConnection } from "./db";

async function waitForDb(retries = 10): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await assertDbConnection();
      return;
    } catch (err) {
      const delay = Math.pow(2, attempt) * 100;
      logger.warn({ err }, `Database connection failed, retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unable to establish database connection");
}

const app = express();
// CORS configuration - MUST be before session middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Always allow credentials
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Set origin explicitly for credential requests
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Cookie, Set-Cookie');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json({ limit: '10mb' })); // Add reasonable payload limits
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(compression());

// Security Headers Middleware - Enhanced protection against common attacks
app.use((req, res, next) => {
  // Prevent clickjacking attacks
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection (for older browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy - Basic protection
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;");
  
  // Remove server header that might leak server info
  res.removeHeader('X-Powered-By');
  
  next();
});
app.use(
  "/.well-known",
  express.static(path.resolve(import.meta.dirname, "../client/.well-known")),
);
app.use(
  "/uploads",
  express.static(path.resolve(import.meta.dirname, "uploads")),
);

app.use((req, res, next) => {
  const start = Date.now();
  const requestPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (requestPath.startsWith("/api")) {
      let logLine = `${req.method} ${requestPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

app.get("/health", (_req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() }),
);

(async () => {
  try {
    await waitForDb();
  } catch (err) {
    logger.error({ err }, "Failed to verify database connection");
    process.exit(1);
  }

  const notificationService = new NotificationService();
  const server = await registerRoutes(app, notificationService);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const host = process.env.HOST || "0.0.0.0";

  const listenOpts: any = { port, host };
  // reusePort causes ENOTSUP on Windows/macOS; only enable on Linux
  if (process.platform === "linux") {
    listenOpts.reusePort = true;
  }

  server.listen(listenOpts, () => {
    log(`serving on http://${host}:${port}`);
  });
})();
