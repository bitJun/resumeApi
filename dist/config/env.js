import path from "node:path";
import { mkdirSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config();
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const STORAGE_DIR = path.join(ROOT_DIR, "src", "storage", "uploads");
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(STORAGE_DIR, { recursive: true });
export const env = {
    port: Number(process.env.PORT ?? 4000),
    frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
    openAiApiKey: process.env.OPENAI_API_KEY ?? "",
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    openAiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    dataDir: DATA_DIR,
    storageDir: STORAGE_DIR,
    databaseFile: path.join(DATA_DIR, "resume.db")
};
