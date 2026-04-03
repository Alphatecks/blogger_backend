import "dotenv/config";
import cors from "cors";
import express from "express";

import { apiRouter } from "./routes";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", apiRouter);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
