import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        }}
      >
        <svg width="128" height="128" viewBox="0 0 48 48" fill="none">
          <path
            d="M24 1.6c1.4 1.9 2.2 3.3 2.2 4.4a2.2 2.2 0 1 1-4.4 0c0-1.1.8-2.5 2.2-4.4Z"
            fill="#e8b054"
          />
          <g transform="translate(0 5.5)">
            <path
              d="M7.5 7h33v4c0 4.6-1.7 8.8-4.4 11.9-2.5 2.9-5.7 4.8-9.3 5.4V36h7.2v4.8h-20V36h7.2v-7.7c-3.6-.6-6.8-2.5-9.3-5.4C9.2 19.8 7.5 15.6 7.5 11V7Z"
              fill="#e8b054"
            />
          </g>
        </svg>
      </div>
    ),
    { ...size }
  );
}
