import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const alt = `${BRAND.name} — new liquor filings, before the doors open`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0906",
          padding: 72,
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "#e9a13b",
            fontSize: 24,
            letterSpacing: 8,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: "#e9a13b",
            }}
          />
          {BRAND.name.toUpperCase()}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ color: "#f2ead9", fontSize: 84, lineHeight: 1.02, letterSpacing: -2 }}>
            Every new bar.
          </div>
          <div style={{ color: "#e9a13b", fontSize: 84, fontStyle: "italic", letterSpacing: -2 }}>
            Before it opens.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "#8d8375",
            fontSize: 26,
            fontFamily: "monospace",
            letterSpacing: 3,
          }}
        >
          <span>TX + NY REGISTRIES · SWEPT DAILY</span>
          <span style={{ color: "#e9a13b" }}>{BRAND.url.replace(/^https?:\/\//, "")}</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
