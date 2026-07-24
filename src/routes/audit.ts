import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import pLimit from "p-limit";
import rateLimit from "express-rate-limit";
import { auditUrl } from "../services/auditor";
import { TTLCache, normalizeUrl } from "../services/cache";
import { AppError } from "../middleware/errorHandler";

export const auditRouter = Router();

// ---- Config (env-driven, with sane defaults) ----
const CACHE_TTL_SECONDS = process.env.CACHE_TTL_SECONDS
  ? parseInt(process.env.CACHE_TTL_SECONDS)
  : 300;
const MAX_CONCURRENT_AUDITS = process.env.MAX_CONCURRENT_AUDITS
  ? parseInt(process.env.MAX_CONCURRENT_AUDITS)
  : 20;

const cache = new TTLCache<any>(CACHE_TTL_SECONDS);
const limit = pLimit(MAX_CONCURRENT_AUDITS);
let inFlight = 0;

// ---- Rate limiting: 60 requests/minute per IP ----
const auditRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Please slow down.",
    },
  },
});

auditRouter.use(auditRateLimiter);

// ---- Input validation schema ----
const auditRequestSchema = z.object({
  url: z.string().url({ message: "Must be a valid URL, e.g. https://example.com" }),
});

auditRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = auditRequestSchema.safeParse(req.body);

      if (!parseResult.success) {
        const zodIssues =
          (parseResult.error as any).issues ??
          (parseResult.error as any).errors ??
          [];
        const messages = zodIssues
          .map((e: any) => e.message)
          .join("; ") || "Invalid input";

        throw new AppError(400, "INVALID_INPUT", messages);
      }

      const { url } = parseResult.data;
      const cacheKey = normalizeUrl(url);

      // Check cache first
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json({ ...cached, cached: true });
      }

      // Concurrency guard: reject if we're at capacity
      if (inFlight >= MAX_CONCURRENT_AUDITS) {
        throw new AppError(
          429,
          "TOO_MANY_CONCURRENT_AUDITS",
          "Server is at capacity. Please retry shortly."
        );
      }

      inFlight++;
      let result;
      try {
        result = await limit(() => auditUrl(url));
      } finally {
        inFlight--;
      }

      cache.set(cacheKey, result);

      res.json({ ...result, cached: false, cachedAt: null });
    } catch (err) {
      next(err);
    }
  }
);