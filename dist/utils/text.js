export function cleanResumeText(rawText) {
    return rawText
        .replace(/\u0000/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[^\S\r\n]{2,}/g, " ")
        .trim();
}
export function normalizeKeyword(value) {
    return value.toLowerCase().replace(/[^\p{L}\p{N}+.#/]/gu, "");
}
export function uniqueStrings(values) {
    return Array.from(new Set(values.filter(Boolean).map((item) => item.trim()))).filter(Boolean);
}
export function stripCodeFence(content) {
    return content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}
export function splitCommaValues(value) {
    return uniqueStrings(value
        .split(/[、,，/|]/)
        .map((item) => item.trim())
        .filter(Boolean));
}
