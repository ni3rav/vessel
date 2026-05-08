import { auth } from "@/lib/auth";
import { Context, Elysia } from "elysia";

export const app = new Elysia({ prefix: "/api" }).get("/", "Backend is running");

const betterAuthView = (context: Context) => {
  const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"];
  if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
    return auth.handler(context.request);
  } else {
    return new Response("Method Not Allowed", { status: 405 });
  }
};

app.all("/auth", betterAuthView);
app.all("/auth/*", betterAuthView);

export const GET = app.fetch;
export const POST = app.fetch;
export const DELETE = app.fetch;
export const PUT = app.fetch;
export const PATCH = app.fetch;
export const OPTIONS = app.fetch;
export const HEAD = app.fetch;
export const TRACE = app.fetch;
export const CONNECT = app.fetch;
export const MERGE = app.fetch;
export const COPY = app.fetch;
export const LOCK = app.fetch;
export const UNLOCK = app.fetch;
