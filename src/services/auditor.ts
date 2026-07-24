import * as cheerio from "cheerio";
import { AppError } from "../middleware/errorHandler";

export interface AuditResult {
  url: string;
  statusCode: number;
  isHttps: boolean;
  responseTimeMs: number;
  pageSizeBytes: number;
  title: string | null;
  metaDescription: string | null;
}

const FETCH_TIMEOUT_MS = 10_000;

export async function auditUrl(url: string): Promise<AuditResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const startTime = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new AppError(
        504,
        "UPSTREAM_TIMEOUT",
        `The target URL did not respond within ${FETCH_TIMEOUT_MS / 1000}s`
      );
    }
    throw new AppError(
      502,
      "UPSTREAM_UNREACHABLE",
      `Could not reach the target URL: ${err.message}`
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseTimeMs = Date.now() - startTime;

  if (!response.ok) {
    throw new AppError(
      502,
      "UPSTREAM_ERROR_STATUS",
      `Target URL responded with status ${response.status}`
    );
  }

  const html = await response.text();
  const pageSizeBytes = Buffer.byteLength(html, "utf-8");

  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() || null;

  return {
    url,
    statusCode: response.status,
    isHttps: url.startsWith("https://"),
    responseTimeMs,
    pageSizeBytes,
    title,
    metaDescription,
  };
}