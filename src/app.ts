import express from "express";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import { auditRouter } from "./routes/audit";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

app.use(express.json());

app.use(
  pinoHttp({
    genReqId: (req, res) => {
      const id = randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
  })
);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: sans-serif; padding: 2rem;">
        <h1>Page Pulse API</h1>
        <p>A production-grade URL audit service.</p>
        <p>See <code>POST /audit</code> for the main endpoint.</p>
        <footer style="margin-top: 3rem; font-size: 0.8rem;">
          Built for <a href="https://digitalheroesco.com" target="_blank">Digital Heroes Training Task</a>
        </footer>
      </body>
    </html>
  `);
});

app.use("/audit", auditRouter);

app.use(errorHandler);