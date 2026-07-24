import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../src/app";

describe("POST /audit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a missing url with 400", async () => {
    const res = await request(app).post("/audit").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  it("rejects a malformed url with 400", async () => {
    const res = await request(app)
      .post("/audit")
      .send({ url: "not-a-url" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  it("returns audit data for a valid url", async () => {
    const fakeHtml = `
      <html>
        <head>
          <title>Example Page</title>
          <meta name="description" content="An example description" />
        </head>
        <body></body>
      </html>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => fakeHtml,
      })
    );

    const res = await request(app)
      .post("/audit")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Example Page");
    expect(res.body.metaDescription).toBe("An example description");
    expect(res.body.cached).toBe(false);
  });

  it("returns a cached result on the second identical request", async () => {
    const fakeHtml = `<html><head><title>Cached Page</title></head><body></body></html>`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => fakeHtml,
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://example.com/cache-test";

    const first = await request(app).post("/audit").send({ url });
    expect(first.body.cached).toBe(false);

    const second = await request(app).post("/audit").send({ url });
    expect(second.body.cached).toBe(true);

    // fetch should only have been called once — second was served from cache
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 502 when the upstream site errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "",
      })
    );

    const res = await request(app)
      .post("/audit")
      .send({ url: "https://example.com/broken" });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("UPSTREAM_ERROR_STATUS");
  });

  it("returns 504 when the upstream site times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        const err: any = new Error("aborted");
        err.name = "AbortError";
        return Promise.reject(err);
      })
    );

    const res = await request(app)
      .post("/audit")
      .send({ url: "https://example.com/slow" });

    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe("UPSTREAM_TIMEOUT");
  });
});