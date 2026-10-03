import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Bold glass + last drop on an oxblood tile. Solid shapes only — crisp at 16px.
function Glass({ s, drop = true }: { s: number; drop?: boolean }) {
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
      {drop && (
        <path
          d="M24 1.6c1.4 1.9 2.2 3.3 2.2 4.4a2.2 2.2 0 1 1-4.4 0c0-1.1.8-2.5 2.2-4.4Z"
          fill="#e8b054"
        />
      )}
      <g transform={drop ? "translate(0 5.5)" : undefined}>
        <path
          d="M7.5 7h33v4c0 4.6-1.7 8.8-4.4 11.9-2.5 2.9-5.7 4.8-9.3 5.4V36h7.2v4.8h-20V36h7.2v-7.7c-3.6-.6-6.8-2.5-9.3-5.4C9.2 19.8 7.5 15.6 7.5 11V7Z"
          fill="#e8b054"
        />
      </g>
    </svg>
  );
}

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#42161e",
          borderRadius: 14,
        }}
      >
        <Glass s={50} />
      </div>
    ),
    { ...size }
  );
}
