import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { routes } from "./routes";
import { errorHandler, notFoundHandler } from "./lib/errors";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(port, () => {
  console.log(`Invoice API listening on port ${port}`);
});
