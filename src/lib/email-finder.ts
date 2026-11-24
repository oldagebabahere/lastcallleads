// Finds a REAL contact email on a company's own website (mailto: links or
// visible text on home/contact pages). Includes strict SSRF guards against
// private/loopback/metadata addresses.
import dns from "node:dns/promises";
import net from "node:net";

const PAGES = ["", "/contact", "/contact-us", "/about"];
const BAD_LOCAL =
  /^(no-?reply|donotreply|do-not-reply|example|test|sentry|wixpress|webmaster|postmaster|abuse|privacy|unsubscribe|mailer-daemon|phishing|spam|security|fraud|report|reports|legal|compliance|hr|careers|jobs|recruiting|press|media|billing|accounting|noc|dmca|copyright|ethics|whistleblower|investor|investors|ir|claims|complaints|optout|opt-out|support-?abuse|admin-?abuse|customerservice|customer-?service|agencyservices|clientservice|clientsupport|helpdesk|supportdesk|escrow|closing|closings|title|underwriting|policy|policies|auto|claimsdept|accessibility|ada)$/i;
const GOOD_LOCAL =
  /^(sales|wholesale|distribution|distributor|commercial|hospitality|quotes?|newbusiness|partnerships|orders|contact|info|office|hello|inquiries|inquiry)$/i;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80") ||
      lower.startsWith("::ffff:127.") ||
      lower.startsWith("::ffff:10.") ||
      lower.startsWith("::ffff:169.254.") ||
      lower.startsWith("::ffff:192.168.")
    ) {
      return true;
    }
    return false;
  }
  return true;
}

export async function isSafePublicHost(hostname: string): Promise<boolean> {
  const lower = hostname.toLowerCase();
  if (
    !lower ||
    lower === "localhost" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".localhost") ||
    !lower.includes(".")
  ) {
    return false;
  }
  if (net.isIP(lower)) {
    return !isPrivateIp(lower);
  }
  try {
    const addrs = await dns.lookup(lower, { all: true });
    if (!addrs.length) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

function originOf(site: string): { origin: string; host: string; rawHost: string } | null {
  try {
    const u = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return {
      origin: u.origin,
      rawHost: u.hostname.toLowerCase(),
      host: u.hostname.toLowerCase().replace(/^www\./, ""),
    };
  } catch {
    return null;
  }
}

async function getText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LastCallLeadsBot/2.0)" },
      signal: AbortSignal.timeout(4_000),
      redirect: "manual",
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return "";
      const next = new URL(loc, url);
      if (next.protocol !== "http:" && next.protocol !== "https:") return "";
      if (!(await isSafePublicHost(next.hostname))) return "";
      const res2 = await fetch(next.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LastCallLeadsBot/2.0)" },
        signal: AbortSignal.timeout(4_000),
        redirect: "manual",
        cache: "no-store",
      });
      if (!res2.ok) return "";
      const type2 = res2.headers.get("content-type") ?? "";
      if (!type2.includes("text/html") && !type2.includes("text/plain")) return "";
      return (await res2.text()).slice(0, 300_000);
    }
    if (!res.ok) return "";
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html") && !type.includes("text/plain")) return "";
    return (await res.text()).slice(0, 300_000);
  } catch {
    return "";
  }
}

function sameCompany(emailDomain: string, host: string): boolean {
  const d = emailDomain.toLowerCase();
  return d === host || d.endsWith(`.${host}`) || host.endsWith(`.${d}`);
}

export async function findRealEmail(site: string | null): Promise<string | null> {
  if (!site) return null;
  const o = originOf(site);
  if (!o) return null;
  if (!(await isSafePublicHost(o.rawHost))) return null;

  const found = new Map<string, number>();
  for (const path of PAGES) {
    const html = (await getText(o.origin + path))
      .replace(/&#64;|&commat;|%40/gi, "@")
      .replace(/\s*\[at\]\s*/gi, "@");
    if (!html) continue;
    const re = /[a-z0-9._%+-]{1,64}@[a-z0-9.-]+\.[a-z]{2,}/gi;
    for (const m of html.matchAll(re)) {
      const email = m[0].toLowerCase().replace(/^mailto:/, "");
      const [local, domain] = email.split("@");
      if (!local || !domain) continue;
      if (/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(domain)) continue;
      if (BAD_LOCAL.test(local)) continue;
      if (!sameCompany(domain, o.host)) continue;
      const score = GOOD_LOCAL.test(local) ? 2 : 1;
      found.set(email, Math.max(found.get(email) ?? 0, score));
    }
    if (found.size) break;
  }
  if (!found.size) return null;
  return [...found.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}
