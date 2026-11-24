import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function makeMissingDbPool(): Pool {
  // Real pg Pool instance so drizzle-orm's client/constructor inspection works
  // at build time without opening any socket; any runtime query fails fast.
  const p = new Pool({
    connectionString: "postgres://invalid:invalid@127.0.0.1:1/missing_database_url",
    max: 1,
    connectionTimeoutMillis: 500,
  });
  const fail = async () => {
    throw new Error("DATABASE_URL environment variable is required");
  };
  p.query = fail as unknown as Pool["query"];
  p.connect = fail as unknown as Pool["connect"];
  return p;
}

function createHostedPool(url: string): Pool {
  // Works seamlessly on Supabase Free (Transaction Pooler :6543 or Session :5432),
  // Neon, Railway, and standard Postgres without exhausting serverless client limits.
  const isHostedCloud =
    /supabase\.(co|com)|neon\.tech|render\.com|amazonaws\.com|sslmode=require/i.test(url);
  return new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ...(isHostedCloud ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

export const pool: Pool = databaseUrl
  ? (globalForDb.__arenaNextJsPostgresqlPool ?? createHostedPool(databaseUrl))
  : makeMissingDbPool();

if (databaseUrl && process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
