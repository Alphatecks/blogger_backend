import "dotenv/config";
import cors from "cors";
import express, { type Request } from "express";
import path from "path";

import { getAdminClient } from "./lib/db";
import { apiRouter } from "./routes";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      const request = req as Request & { rawBody?: Buffer };
      if (request.originalUrl.startsWith("/api/shop/paystack/webhook")) {
        request.rawBody = buf;
      }
    }
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/health/db", async (_req, res) => {
  try {
    const admin = getAdminClient();
    const { error } = await admin.from("posts").select("id").limit(1);

    if (error) {
      const isConnectionError = error.message.toLowerCase().includes("fetch failed");
      res.status(isConnectionError ? 503 : 500).json({
        status: "error",
        message: isConnectionError
          ? "Cannot reach Supabase. Check SUPABASE_URL on Render and ensure the Supabase project is not paused."
          : error.message
      });
      return;
    }

    res.status(200).json({ status: "ok", message: "Supabase connection successful" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database health check failed";
    res.status(500).json({ status: "error", message });
  }
});

app.use("/api", apiRouter);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
