"use client";

import { useState } from "react";
import { CalendarPlus, Check, Copy, Mail, MapPin, PhoneCall, UserPlus } from "lucide-react";

type Tab = "email" | "call" | "dropby";

function googleCalendarFollowUpUrl(opts: {
  title: string;
  location: string;
  details: string;
}): string {
  const d = new Date(Date.now() + 7 * 86_400_000);
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const dates = `${ymd}T150000Z/${ymd}T153000Z`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title.slice(0, 120),
    dates,
    location: opts.location.slice(0, 180),
    details: opts.details.slice(0, 800),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadVCard(opts: {
  venueName: string;
  ownerName?: string;
  phone?: string;
  address?: string;
  note?: string;
}) {
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/;/g, ",").trim();
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${clean(opts.venueName)}`,
    `ORG:${clean(opts.ownerName || opts.venueName)}`,
    opts.phone ? `TEL;TYPE=WORK,VOICE:${clean(opts.phone)}` : "",
    opts.address ? `ADR;TYPE=WORK:;;${clean(opts.address)};;;;` : "",
    opts.note ? `NOTE:${clean(opts.note).slice(0, 350)}` : "",
    "END:VCARD",
  ].filter(Boolean);

  const blob = new Blob([lines.join("\r\n")], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opts.venueName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "venue"}.vcf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function OutreachKit({
  coldEmailSubject,
  coldEmailBody,
  callOpener,
  dropByNote,
  venueName,
  venueAddress,
  venuePhone,
  ownerName,
}: {
  coldEmailSubject: string;
  coldEmailBody: string;
  callOpener: string;
  dropByNote: string;
  venueName?: string;
  venueAddress?: string;
  venuePhone?: string | null;
  ownerName?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("email");
  const [copied, setCopied] = useState(false);

  const activeText =
    tab === "email"
      ? `Subject: ${coldEmailSubject}\n\n${coldEmailBody}`
      : tab === "call"
        ? callOpener
        : dropByNote;

  const calUrl = googleCalendarFollowUpUrl({
    title: `Follow up: ${venueName || coldEmailSubject}`,
    location: venueAddress || "",
    details: `${dropByNote}\n\nCall Opener:\n${callOpener}`,
  });

  async function copyText() {
    try {
      await navigator.clipboard.writeText(activeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked
    }
  }

  return (
    <div className="rounded-xl border border-amber/35 bg-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.22em] text-amber">
            READY-TO-SEND BEVERAGE REP OUTREACH KIT
          </p>
          <p className="mt-1 text-xs text-smoke">
            Copy pitch scripts, save straight to phone Contacts (.vcf), or lock a 7-day calendar
            follow-up in 1 click.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {venueName && (
            <button
              type="button"
              onClick={() =>
                downloadVCard({
                  venueName,
                  ownerName: ownerName ?? undefined,
                  phone: venuePhone ?? undefined,
                  address: venueAddress,
                  note: dropByNote,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-ink px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.12em] text-cream transition-colors hover:border-amber/60 hover:text-amber"
            >
              <UserPlus className="h-3.5 w-3.5 text-mint-bright" />
              SAVE CONTACT (.VCF)
            </button>
          )}
          <a
            href={calUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-ink px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.12em] text-cream transition-colors hover:border-amber/60 hover:text-amber"
          >
            <CalendarPlus className="h-3.5 w-3.5 text-amber" />
            REMIND IN 7 DAYS
          </a>
          <button
            type="button"
            onClick={copyText}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber px-3.5 py-2 font-mono text-[10px] font-semibold tracking-[0.12em] text-[#140b0e] transition-transform hover:scale-[1.03]"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "COPIED" : "COPY SCRIPT"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["email", "COLD EMAIL", Mail],
            ["call", "CALL OPENER", PhoneCall],
            ["dropby", "DROP-BY NOTE", MapPin],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setCopied(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] transition-colors ${
              tab === id
                ? "border-amber/60 bg-amber/15 text-amber"
                : "border-line bg-ink text-smoke hover:text-cream"
            }`}
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
      </div>

      <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-line bg-ink p-4 font-mono text-xs leading-relaxed text-cream/90">
        {activeText}
      </pre>
    </div>
  );
}
