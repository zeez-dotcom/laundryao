import type { Express } from "express";
import { pool } from "../db";

export function registerHealthRoutes(app: Express) {
  app.get("/health/db", async (_req, res) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ok" });
    } catch (err) {
      res.status(500).json({ status: "error" });
    }
  });
}
