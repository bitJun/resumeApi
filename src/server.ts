import express from "express";
import cors from "cors";
import candidateRoutes from "./routes/candidate.routes.js";
import jobRoutes from "./routes/job.routes.js";
import systemRoutes from "./routes/system.routes.js";
import { env } from "./config/env.js";

const app = express();

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: false
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", systemRoutes);
app.use("/api/candidates", candidateRoutes);
app.use("/api/jobs", jobRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({
    message: error instanceof Error ? error.message : "服务内部错误。"
  });
});

app.listen(env.port, () => {
  console.log(`Resume backend listening on http://localhost:${env.port}`);
});
