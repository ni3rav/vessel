import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";

export const db = drizzle(env.DATABASE_URL, { schema });
