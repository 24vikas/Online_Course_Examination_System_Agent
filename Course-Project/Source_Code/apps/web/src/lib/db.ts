import pg from "pg";
const { Pool } = pg;
import type { Pool as PoolType, QueryResult, QueryResultRow } from "pg";

const shared = globalThis as typeof globalThis & { auraDbPool?: PoolType };

export function getDbPool(): PoolType {
  if (!shared.auraDbPool) {
    shared.auraDbPool = new Pool({
      host: process.env.PGHOST || "127.0.0.1",
      port: parseInt(process.env.PGPORT || "54322", 10),
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "postgres",
      database: process.env.PGDATABASE || "postgres",
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    shared.auraDbPool.on("error", (err) => {
      console.error("Unexpected error on idle PostgreSQL client", err);
    });
  }
  return shared.auraDbPool;
}

export async function queryDb<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const p = getDbPool();
  return p.query<T>(text, params);
}
