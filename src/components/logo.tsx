// The Last Call mark: an elegant solid wine-glass silhouette with the last
// drop falling in. Smooth tapered bowl, solid shapes — reads perfectly from
// 16px favicon to hero size, and inherits `currentColor` everywhere.
export function LogoMark({
  className = "",
  withDrop = false,
}: {
  className?: string;
  withDrop?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {withDrop && (
        <path
          d="M24 1.6c1.4 1.9 2.2 3.3 2.2 4.4a2.2 2.2 0 1 1-4.4 0c0-1.1.8-2.5 2.2-4.4Z"
          fill="currentColor"
        />
      )}
      <g transform={withDrop ? "translate(0 5.5)" : undefined}>
        <path
          d="M7.5 7h33v4c0 4.6-1.7 8.8-4.4 11.9-2.5 2.9-5.7 4.8-9.3 5.4V36h7.2v4.8h-20V36h7.2v-7.7c-3.6-.6-6.8-2.5-9.3-5.4C9.2 19.8 7.5 15.6 7.5 11V7Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-6 w-6 text-amber" />
      <span className="font-display text-lg font-semibold tracking-tight">
        LAST CALL LEADS<span className="text-amber">.</span>
      </span>
    </span>
  );
}
