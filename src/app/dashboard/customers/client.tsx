"use client";
// Customer Manager — interactive bits (buttons/forms). All calls go to
// /api/admin/customers with the ADMIN_KEY that the page already holds.
import { useRouter } from "next/navigation";
import { useState } from "react";

async function call(
  k: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/admin/customers?key=${encodeURIComponent(k)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: "bad_response" }));
}

const btn =
  "rounded-md border border-line bg-panel px-3 py-2 font-mono text-[11px] tracking-[0.12em] text-amber hover:border-amber/50";
const input =
  "w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-cream placeholder:text-faint";

/* ---- send a test email (email-machine debugger) ------------------- */
export function TestEmail({ k }: { k: string }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Record<string, unknown> | null>(null);
  return (
    <div>
      <button
        className={btn}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setOut(await call(k, { action: "test_email" }));
          setBusy(false);
        }}
      >
        {busy ? "BHEJ RAHA HAI…" : "✉ SEND TEST EMAIL"}
      </button>
      {out && (
        <p
          className={`mt-2 font-mono text-[11px] leading-relaxed ${
            out.status === "sent" ? "text-green-400" : out.status === "dry_run" ? "text-amber" : "text-red-400"
          }`}
        >
          {String(out.status).toUpperCase()} — {String(out.detail ?? out.error ?? "")}
          {out.from ? ` (from: ${String(out.from)})` : ""}
        </p>
      )}
    </div>
  );
}

/* ---- add / activate a customer ------------------------------------ */
export function AddCustomer({ k }: { k: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("solo");
  const [states, setStates] = useState("TX");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="font-mono text-[10px] tracking-[0.15em] text-faint">
        ADD / ACTIVATE CUSTOMER (manual payment, Dodo link, ya fix)
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <input className={input} placeholder="customer@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} placeholder="naam (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={input} value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="solo">solo — $129 · 1 state</option>
          <option value="pro">pro — $249 · 3 states</option>
          <option value="enterprise">enterprise — $499 · API</option>
        </select>
        <input className={input} placeholder="states (TX,NY)" value={states} onChange={(e) => setStates(e.target.value)} />
      </div>
      <button
        className={`${btn} mt-3`}
        disabled={busy || !email}
        onClick={async () => {
          setBusy(true);
          const r = await call(k, { action: "activate", email, name: name || undefined, plan, states });
          setOut(
            r.ok
              ? `✓ ${r.mode} — welcome email: ${String(r.welcome)}`
              : `✗ ${String(r.error)}`
          );
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "…" : "ACTIVATE + WELCOME EMAIL"}
      </button>
      {out && <p className="mt-2 font-mono text-[11px] text-amber">{out}</p>}
    </div>
  );
}

/* ---- pause / resume per row ---------------------------------------- */
export function RowButtons({
  k,
  email,
  status,
}: {
  k: string;
  email: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const active = status === "active" || status === "trial";
  return (
    <button
      className="rounded border border-line px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-smoke hover:border-amber/50 hover:text-amber"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await call(k, {
          action: "set_status",
          email,
          status: active ? "canceled" : "active",
        });
        setBusy(false);
        router.refresh();
      }}
    >
      {active ? "⏸ PAUSE" : "▶ ACTIVE"}
    </button>
  );
}

/* ---- $499 enterprise API key generator ----------------------------- */
export function GenKey() {
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="font-mono text-[10px] tracking-[0.15em] text-faint">
        $499 ENTERPRISE API KEY
      </p>
      <button
        className={`${btn} mt-3`}
        onClick={() => {
          const bytes = new Uint8Array(19);
          crypto.getRandomValues(bytes);
          const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
          setKey(`lcl_live_${hex}`);
          setCopied(false);
        }}
      >
        🔑 GENERATE KEY
      </button>
      {key && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input readOnly className={`${input} font-mono text-[12px]`} value={key} />
            <button
              className={btn}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(key);
                  setCopied(true);
                } catch {
                  /* clipboard blocked — select manually */
                }
              }}
            >
              {copied ? "✓ COPIED" : "COPY"}
            </button>
          </div>
          <ol className="list-decimal space-y-1 pl-4 font-mono text-[10px] leading-relaxed text-smoke">
            <li>Vercel → Settings → Environment Variables</li>
            <li>
              <span className="text-amber">ENTERPRISE_API_KEYS</span> me comma se add karo
              (pehli baar naya banao, doosri baar purani ke aage comma laga ke)
            </li>
            <li>Redeploy</li>
            <li>Ye key + niche wala snippet customer ko email kar do</li>
          </ol>
          <pre className="overflow-x-auto rounded-md border border-line bg-ink p-3 font-mono text-[10px] leading-relaxed text-cream">{`curl "https://lastcallleads.com/api/v1?endpoint=filings&state=TX&limit=5" \\
  -H "x-api-key: ${key}"`}</pre>
        </div>
      )}
    </div>
  );
}
