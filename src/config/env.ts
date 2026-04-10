import path from "node:path";
import { mkdirSync } from "node:fs";
import dotenv from "dotenv";

dotenv.config();

const ROOT_DIR = process.cwd();
const IS_SERVERLESS = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
const RUNTIME_ROOT = process.env.RUNTIME_ROOT ?? (IS_SERVERLESS ? "/tmp/resume-runtime" : ROOT_DIR);
const DATA_DIR = process.env.DATA_DIR ?? path.join(RUNTIME_ROOT, IS_SERVERLESS ? "data" : "data");
const STORAGE_DIR =
  process.env.STORAGE_DIR ?? path.join(RUNTIME_ROOT, IS_SERVERLESS ? "uploads" : path.join("src", "storage", "uploads"));

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(STORAGE_DIR, { recursive: true });

export const env = {
  isServerless: IS_SERVERLESS,
  port: Number(process.env.PORT ?? 4000),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? process.env.FRONTEND_URL ?? "http://localhost:3000")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  openAiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  runtimeRoot: RUNTIME_ROOT,
  dataDir: DATA_DIR,
  storageDir: STORAGE_DIR,
  databaseFile: path.join(DATA_DIR, "resume.db")
};
