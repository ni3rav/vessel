import { createDb } from "@vessel/database";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";

export const db = createDb(env.DATABASE_URL, schema);
