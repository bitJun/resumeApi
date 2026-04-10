import serverless from "serverless-http";
import app from "../../src/app";

const expressHandler = serverless(app, {
  binary: ["application/pdf"]
});

export const handler = async (event: Record<string, unknown>, context: unknown) => {
  const path = typeof event.path === "string" ? event.path : "";
  const normalizedPath = path.replace(/^\/\.netlify\/functions\/api/, "") || "/api/health";

  return expressHandler(
    {
      ...event,
      path: normalizedPath
    },
    context
  );
};
