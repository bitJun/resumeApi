import cors, { CorsOptions } from "cors";
import express from "express";
import { env } from "./config/env.js";
import candidateRoutes from "./routes/candidate.routes.js";
import jobRoutes from "./routes/job.routes.js";
import systemRoutes from "./routes/system.routes.js";

function buildCorsOptions(): CorsOptions {
  return {
    origin(origin, callback) {
      // Allow requests without Origin, such as server-to-server calls and curl.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  };
}

export function createApp() {
  const app = express();
  const corsOptions = buildCorsOptions();

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));
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

  return app;
}

const app = createApp();

export default app;
