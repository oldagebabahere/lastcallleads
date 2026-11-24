"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, LoaderCircle, Upload } from "lucide-react";

type ParsedFlRow = {
  licenseNumber: string;
  primaryStatus: string;
  series: string;
  dba: string;
  ownerName: string;
  address: string;
  city: string;
  zip: string;
  county: string;
  originalDate: string;
  effectiveDate: string;
  expirationDate: string;
};

// Lightweight RFC-4180 CSV line parser that runs right in the browser so 14MB
// Florida DBPR files shrink to <200KB of fresh/pending leads before uploading.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function isRecentDate(raw: string, days = 45): boolean {
  if (!raw) return false;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  return t >= now - days * 86_400_000 && t <= now + 7 * 86_400_000;
}

export default function FlCsvUploader({ adminKey }: { adminKey: string }) {
  const [busy, setBusy] = useState(false);
  const [sendDigests, setSendDigests] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(file: File | null) {
    if (!file || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        setMsg({ ok: false, text: "CSV looks empty." });
        setBusy(false);
        return;
      }

      // Skip optional agency banner line without commas
      const headerIdx = lines[0].includes(",") ? 0 : 1;
      const headers = parseCsvLine(lines[headerIdx]).map((h) =>
        h.toLowerCase().replace(/^\uFEFF/, "").trim()
      );
      const col = (...names: string[]) => {
        for (const n of names) {
          const idx = headers.indexOf(n);
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const iLic = col("license number", "lic number", "license_number");
      const iStat = col("primary status", "status", "primary status code");
      const iSer = col("series", "rank", "license type");
      const iDba = col("dba", "dba name", "trade name");
      const iOwn = col("owner name", "licensee name", "name");
      const iAddr = col("location address 1", "location street address", "street address");
      const iCity = col("location city", "city");
      const iZip = col("location zip", "location zip code", "zip");
      const iCty = col("location county", "county");
      const iOrig = col("original licensure date", "original date", "application date");
      const iEff = col("effective date", "issue date", "last status date");
      const iExp = col("expiration date", "expire date");

      if (iLic === -1) {
        setMsg({
          ok: false,
          text: 'Could not find "License Number" column — make sure you selected Florida DBPR bd4006lic.csv.',
        });
        setBusy(false);
        return;
      }

      const freshRows: ParsedFlRow[] = [];
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const vals = parseCsvLine(lines[i]);
        const lic = vals[iLic] ?? "";
        if (!lic) continue;
        const primaryStatus = iStat >= 0 ? (vals[iStat] ?? "") : "";
        const orig = iOrig >= 0 ? (vals[iOrig] ?? "") : "";
        const eff = iEff >= 0 ? (vals[iEff] ?? "") : "";
        const isPending = primaryStatus === "10";
        if (!isPending && !isRecentDate(orig, 45) && !isRecentDate(eff, 45)) continue;

        freshRows.push({
          licenseNumber: lic,
          primaryStatus,
          series: iSer >= 0 ? (vals[iSer] ?? "") : "",
          dba: iDba >= 0 ? (vals[iDba] ?? "") : "",
          ownerName: iOwn >= 0 ? (vals[iOwn] ?? "") : "",
          address: iAddr >= 0 ? (vals[iAddr] ?? "") : "",
          city: iCity >= 0 ? (vals[iCity] ?? "") : "",
          zip: iZip >= 0 ? (vals[iZip] ?? "") : "",
          county: iCty >= 0 ? (vals[iCty] ?? "") : "",
          originalDate: orig,
          effectiveDate: eff,
          expirationDate: iExp >= 0 ? (vals[iExp] ?? "") : "",
        });
        if (freshRows.length >= 2500) break;
      }

      if (!freshRows.length) {
        setMsg({
          ok: false,
          text: `Scanned ${lines.length.toLocaleString()} rows, found 0 pending or recent (last 45d) Florida filings.`,
        });
        setBusy(false);
        return;
      }

      const res = await fetch("/api/admin/upload-fl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ rows: freshRows, triggerDigest: sendDigests }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (data.ok) {
        setMsg({
          ok: true,
          text: `Florida imported! Scanned ${lines.length.toLocaleString()} rows → stored ${Number(data.newLicenses ?? 0).toLocaleString()} licenses & ${Number(data.newEvents ?? 0).toLocaleString()} fresh filings.${
            sendDigests ? ` Digests sent: ${Number(data.digestSent ?? 0)}.` : ""
          }`,
        });
      } else {
        setMsg({ ok: false, text: `Upload error: ${String(data.error ?? "failed")}` });
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-cream/75">
        Florida DBPR blocks automated servers with Cloudflare, so download the official file in your
        own browser in 3 seconds, then drop it here. Browser auto-filters to fresh/pending filings
        (&lt;200 KB upload) and emails your Florida subscribers immediately.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href="https://www2.myfloridalicense.com/sto/file_download/extracts/bd4006lic.csv"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber/45 bg-amber/10 px-3.5 py-2 font-mono text-xs font-semibold text-amber hover:bg-amber/20"
        >
          1. DOWNLOAD OFFICIAL FL CSV <ExternalLink className="h-3.5 w-3.5" />
        </a>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-amber px-4 py-2 font-mono text-xs font-bold text-[#140b0e] hover:brightness-110">
          {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {busy ? "IMPORTING FLORIDA…" : "2. UPLOAD bd4006lic.csv"}
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <label className="inline-flex items-center gap-2 font-mono text-[11px] text-smoke">
          <input
            type="checkbox"
            checked={sendDigests}
            onChange={(e) => setSendDigests(e.target.checked)}
            className="accent-amber"
          />
          Auto-email Florida subscribers right after import
        </label>
      </div>

      {msg && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 font-mono text-xs ${
            msg.ok
              ? "border-leaf/40 bg-leaf/10 text-leaf"
              : "border-blood/40 bg-blood/10 text-blood"
          }`}
        >
          {msg.ok && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
}
