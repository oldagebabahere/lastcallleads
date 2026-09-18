"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Send } from "lucide-react";

export default function ContactForm() {
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase === "sending") return;
    setPhase("sending");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "failed");
      setPhase("sent");
      setMessage(json.message ?? "Your message was received.");
      form.reset();
    } catch {
      setPhase("error");
      setMessage("Could not send right now. Please use the support email shown on this page.");
    }
  }

  if (phase === "sent") {
    return (
      <div className="flex gap-3 rounded-xl border border-leaf/40 bg-leaf/10 p-6">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-leaf" />
        <div>
          <p className="font-medium text-cream">Message received.</p>
          <p className="mt-1 text-sm leading-relaxed text-smoke">{message}</p>
        </div>
      </div>
    );
  }

  const input =
    "w-full rounded-md border border-line bg-ink px-3.5 py-2.5 text-sm text-cream placeholder:text-faint focus:border-amber/60 focus:outline-none";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-panel p-6 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-smoke">
          NAME
          <input name="name" required minLength={2} maxLength={100} className={`${input} mt-1.5`} placeholder="Your name" />
        </label>
        <label className="text-xs text-smoke">
          WORK EMAIL
          <input name="email" type="email" required maxLength={254} className={`${input} mt-1.5`} placeholder="you@company.com" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-smoke">
          COMPANY (OPTIONAL)
          <input name="company" maxLength={150} className={`${input} mt-1.5`} placeholder="Company name" />
        </label>
        <label className="text-xs text-smoke">
          SUBJECT
          <select name="subject" className={`${input} mt-1.5`} defaultValue="Sales question">
            <option>Sales question</option>
            <option>Data correction</option>
            <option>Billing or cancellation</option>
            <option>Partnership or press</option>
            <option>Technical support</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-smoke">
        MESSAGE
        <textarea name="message" required minLength={10} maxLength={5000} rows={7} className={`${input} mt-1.5 resize-y`} placeholder="How can we help?" />
      </label>
      <label className="hidden" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-[11px] leading-relaxed text-faint">
          By sending this form, you agree that we may use the information to answer your request.
        </p>
        <button
          disabled={phase === "sending"}
          className="flex items-center gap-2 rounded-md bg-amber px-5 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink disabled:opacity-50"
        >
          {phase === "sending" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          SEND MESSAGE
        </button>
      </div>
      {phase === "error" && <p className="text-sm text-blood">{message}</p>}
    </form>
  );
}
