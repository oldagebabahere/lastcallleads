// Single source of truth for genuine, deduplicated hospitality filing counts
// by official registry `occurred_at` date (NEVER `detected_at` ingest timestamp).
// Excludes:
//   - bulk historical backfills (`occurred_at` older than the window)
//   - corrupt future registry dates (`occurred_at > now() + 1 day`)
//   - `STATUS_CHANGE` updates / renewals (only `NEW_PENDING` & `NEW_LICENSE`)
//   - federal TTB wholesaler permits & non-live states
//   - non-venue temporary event / school / church permits
//   - duplicate sub-permits filed by the same venue in the same city
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { LIVE_STATE_CODES } from "@/lib/states";

const JUNK_SQL_REGEX =
  "\\\\y(church|catholic|parish|ministr(y|ies)|diocese|chamber of commerce|rotary|lions club|kiwanis|pta|ptso|booster|school district|elementary|middle school|high school|ballet|folklorico|foundation|scouts?|humane society|food bank|fire department|vfd|volunteer fire|historical society|temporary event|nonprofit)\\\\y";

export async function getGenuineNewFilingsByState(days: number): Promise<Map<string, number>> {
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  const stateListSql = sql.join(
    LIVE_STATE_CODES.map((c) => sql`${c}`),
    sql`, `
  );

  const res = await db.execute(sql`
    SELECT
      state,
      count(DISTINCT (
        state || '|' ||
        coalesce(
          nullif(regexp_replace(lower(trim(coalesce(trade_name, ''))), '[^a-z0-9]+', '', 'g'), ''),
          nullif(regexp_replace(lower(trim(coalesce(owner_name, ''))), '[^a-z0-9]+', '', 'g'), ''),
          coalesce(license_key, id::text)
        ) || '|' ||
        regexp_replace(lower(trim(coalesce(city, ''))), '[^a-z0-9]+', '', 'g')
      ))::int AS n
    FROM events
    WHERE state IN (${stateListSql})
      AND event_type IN ('NEW_PENDING', 'NEW_LICENSE')
      AND occurred_at IS NOT NULL
      AND occurred_at > now() - (${safeDays} * interval '1 day')
      AND occurred_at <= now() + interval '1 day'
      AND (license_key IS NULL OR license_key NOT LIKE 'TTB-%')
      AND coalesce(trade_name, '') || ' ' || coalesce(owner_name, '') || ' ' || coalesce(type_name, '') !~* ${JUNK_SQL_REGEX}
    GROUP BY state
    ORDER BY n DESC
  `);

  const out = new Map<string, number>();
  for (const row of res.rows as { state?: string; n?: number }[]) {
    if (row.state) out.set(row.state, Number(row.n ?? 0));
  }
  return out;
}
