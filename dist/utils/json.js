export function safeJsonParse(value, fallback) {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
export function toJson(value) {
    return JSON.stringify(value ?? null);
}
