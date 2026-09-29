import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

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
          background: "#140a0e",
          borderRadius: 14,
        }}
      >
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#e9a13b" strokeWidth="2">
          <path d="M8 22h8" strokeLinecap="round" />
          <path d="M12 15v7" strokeLinecap="round" />
          <path d="M5 3h14l-1.5 8.5a5.5 5.5 0 0 1-11 0L5 3Z" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
