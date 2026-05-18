import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

type DrizzleSchema = Record<string, unknown>;

export function createDb<TSchema extends DrizzleSchema>(databaseUrl: string, schema: TSchema) {
  return drizzle(databaseUrl, { schema }) as NodePgDatabase<TSchema>;
}
