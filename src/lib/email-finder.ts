// Finds a REAL contact email on a company's own website (mailto: links or
// plain text on the home / contact pages). Guessing info@domain bounced for
// most of our leads, which damages the sender's reputation — so we only
// email addresses we actually saw on the company's site.

const PAGES = ["", "/contact", "/contact-us", "/about", "/about-us"];
const BAD_LOCAL = /^(no-?reply|donotreply|do-not-reply|example|test|sentry|wixpress|webmaster|postmaster|abuse|privacy|unsubscribe|mailer-daemon)$/i;
const GOOD_LOCAL = /^(sales|contact|info|office|hello|quotes?|admin|service|support|inquiries|inquiry|orders)$/i;

function originOf(site: string): { origin: string; host: string } | null {
  try {
    const u = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
    return { origin: u.origin, host: u.hostname.toLowerCase().replace(/^www\./, "") };
  } catch {
    return null;
  }
}

async function getText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LastCallLeadsBot/1.0)" },
      signal: AbortSignal.timeout(5_000),
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) return "";
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html") && !type.includes("text/plain")) return "";
    return (await res.text()).slice(0, 400_000);
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
  const found = new Map<string, number>(); // email -> score
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
    if (found.size) break; // good enough — stop crawling
  }
  if (!found.size) return null;
  return [...found.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Run an async mapper with limited concurrency.
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
