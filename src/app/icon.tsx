import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Wine BOTTLE + cork on an oxblood tile. Solid shapes only — crisp at 16px.
function Bottle({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
      {/* cork */}
      <rect x="20.4" y="1.5" width="7.2" height="4.6" rx="1.4" fill="#f0c987" />
      {/* neck + shoulders + body */}
      <path
        d="M21.4 6h5.2v9.3c0 1.2.5 2.3 1.3 3.1l1.5 1.5c1.6 1.6 2.5 3.8 2.5 6.1V40c0 2.4-2 4.4-4.4 4.4h-6.9c-2.4 0-4.4-2-4.4-4.4V26c0-2.3.9-4.5 2.5-6.1l1.5-1.5c.8-.8 1.2-1.9 1.2-3.1V6Z"
        fill="#e8b054"
      />
      {/* label band (tile-colored so it reads as a cutout) */}
      <rect x="15.1" y="27.5" width="17.8" height="10.5" rx="1.6" fill="#42161e" />
      {/* label dot — the "last call" drop */}
      <circle cx="24" cy="32.8" r="2.1" fill="#e8b054" />
      {/* neck highlight */}
      <rect x="22.6" y="8.4" width="1.5" height="5.6" rx="0.75" fill="#f0c987" />
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
        <Bottle s={50} />
      </div>
    ),
    { ...size }
  );
}
