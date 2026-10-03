// Date formatter shared by server and client components.
// Lives OUTSIDE any "use client" file so server components (dashboard,
// feed pages) can call it directly.
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  // Corrupt future dates (registry typos like "2262") never reach the UI.
  if (date.getTime() > Date.now() + 86_400_000) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
