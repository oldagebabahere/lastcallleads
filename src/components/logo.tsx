// The Last Call Leads brand crest — custom burgundy & gold hospitality emblem.
export function LogoMark({
  className = "h-8 w-8",
}: {
  className?: string;
  withDrop?: boolean;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/brand-logo.webp"
      alt="Last Call Leads crest"
      width={512}
      height={512}
      className={`rounded-md object-cover ${className}`}
    />
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-8 w-8 border border-amber/40 shadow-[0_0_16px_-4px_rgba(229,176,80,0.55)]" />
      <span className="font-display text-lg font-semibold tracking-tight">
        LAST CALL LEADS<span className="text-amber">.</span>
      </span>
    </span>
  );
}
