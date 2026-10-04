"use client";
// Customer Manager — interactive bits (v14.5 readable). All calls go to
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
  "rounded-lg bg-amber px-5 py-3 font-mono text-sm font-bold tracking-[0.08em] text-ink hover:bg-amber/90 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-line bg-panel px-4 py-2.5 font-mono text-sm text-amber hover:border-amber/50";
const input =
  "w-full rounded-lg border border-line bg-ink px-4 py-3 text-base text-cream placeholder:text-cream/40";

function ResultBanner({ status, text }: { status: string; text: string }) {
  const cls =
    status === "sent"
      ? "border-green-500/40 bg-green-500/10 text-green-300"
      : status === "dry_run"
        ? "border-amber/40 bg-amber/10 text-amber"
        : "border-red-400/40 bg-red-400/10 text-red-300";
  return (
    <div className={`mt-3 rounded-xl border p-4 text-sm font-medium leading-relaxed ${cls}`}>
      {text}
    </div>
  );
}

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
        <ResultBanner
          status={String(out.status ?? "error")}
          text={`${String(out.status).toUpperCase()} — ${String(out.detail ?? out.error ?? "")}${out.from ? ` (from: ${String(out.from)})` : ""}`}
        />
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
  const [out, setOut] = useState<{ status: string; text: string } | null>(null);
  return (
    <div className="rounded-2xl border border-cream/15 bg-panel p-6">
      <p className="font-mono text-sm font-semibold tracking-[0.12em] text-cream/70">
        2 · ADD / ACTIVATE CUSTOMER — payment Dodo link/manual hua ho to yahan active karo
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input className={input} placeholder="customer@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} placeholder="naam (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={input} value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="solo">solo — $129 · 1 state</option>
          <option value="pro">pro — $249 · 3 states</option>
          <option value="enterprise">enterprise — $499 · API</option>
        </select>
        <input className={input} placeholder="states (jaise TX,NY)" value={states} onChange={(e) => setStates(e.target.value)} />
      </div>
      <button
        className={`${btn} mt-4`}
        disabled={busy || !email}
        onClick={async () => {
          setBusy(true);
          const r = await call(k, { action: "activate", email, name: name || undefined, plan, states });
          setOut(
            r.ok
              ? { status: "sent", text: `✓ HO GAYA (${r.mode}) — welcome email status: ${String(r.welcome)}. Neeche table me dikh jayega.` }
              : { status: "error", text: `✗ ERROR: ${String(r.error)}` }
          );
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "…" : "ACTIVATE + WELCOME EMAIL"}
      </button>
      {out && <ResultBanner status={out.status} text={out.text} />}
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
      className="rounded-lg border border-line px-3 py-2 font-mono text-xs font-semibold tracking-[0.08em] text-cream/70 hover:border-amber/50 hover:text-amber"
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
    <div className="rounded-2xl border border-cream/15 bg-panel p-6">
      <p className="font-mono text-sm font-semibold tracking-[0.12em] text-cream/70">
        4 · $499 ENTERPRISE API KEY — customer ko dene wali chaabi
      </p>
      <button
        className={`${btn} mt-4`}
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
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input readOnly className={`${input} font-mono`} value={key} />
            <button
              className={btnGhost}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(key);
                  setCopied(true);
                } catch {
                  /* clipboard blocked — manually select */
                }
              }}
            >
              {copied ? "✓ COPIED" : "COPY"}
            </button>
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-cream/80">
            <li>Vercel → Settings → Environment Variables kholo</li>
            <li>
              <b className="text-amber">ENTERPRISE_API_KEYS</b> naam ki entry me ye key add karo
              (pehli baar naya banao; agli baar purani key ke aage <b>comma laga ke</b> nayi jodo)
            </li>
            <li>Redeploy kar do</li>
            <li>Neeche wala snippet + key customer ko email kar do — bas, customer live</li>
          </ol>
          <pre className="overflow-x-auto rounded-xl border border-line bg-ink p-4 font-mono text-xs leading-relaxed text-cream">{`curl "https://lastcallleads.com/api/v1?endpoint=filings&state=TX&limit=5" \\
  -H "x-api-key: ${key}"`}</pre>
        </div>
      )}
    </div>
  );
}
