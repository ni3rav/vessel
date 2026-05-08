import { treaty } from "@elysia/eden";
import { app } from "@/app/api/[[...slugs]]/route";
import { env } from "@/lib/env";

// .api to enter /api prefix
export const api =
  // process is defined on server side and build time
  typeof process !== "undefined"
    ? treaty(app).api
    : treaty<typeof app>(env.NEXT_PUBLIC_API_URL).api;
