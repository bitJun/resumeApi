import { readFile } from "node:fs/promises";
import pdf from "pdf-parse";

export async function parsePdfFile(filePath: string) {
  const buffer = await readFile(filePath);
  const parsed = await pdf(buffer);

  return {
    text: parsed.text ?? "",
    pageCount: parsed.numpages ?? 0
  };
}
