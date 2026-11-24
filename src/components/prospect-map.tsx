"use client";

// Map view — every harvested prospect as a pin.
// All popup fields are strictly HTML-escaped and URL-validated (prevents stored XSS).
import { useEffect, useRef, useState } from "react";

export type MapPin = {
  name: string;
  category: string;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string;
  lat: number;
  lng: number;
};

const COLORS: Record<string, string> = {
  attorney: "#e0a458",
  insurance: "#4ea8de",
  beverage: "#c4435a",
  distributor: "#9b72cf",
  bar: "#7bc96f",
};

const LABELS: Record<string, string> = {
  attorney: "Attorneys",
  insurance: "Insurance agents",
  beverage: "Beverage sellers",
  distributor: "Distributors",
  bar: "Bars",
};

function escHtml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHttpUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export default function ProspectMap({ pins }: { pins: MapPin[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if ((window as unknown as { L?: unknown }).L) {
      queueMicrotask(() => {
        if (!cancelled) setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => {
      if (!cancelled) setReady(true);
    };
    s.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    document.body.appendChild(s);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !ref.current || !(window as unknown as { L?: unknown }).L) return;
    const L = (window as unknown as {
      L: {
        map: (el: HTMLElement, opts: object) => {
          setView: (c: [number, number], z: number) => void;
          remove: () => void;
        };
        tileLayer: (url: string, opts: object) => { addTo: (m: unknown) => void };
        circleMarker: (
          c: [number, number],
          opts: object
        ) => {
          addTo: (m: unknown) => void;
          bindPopup: (h: string) => void;
        };
      };
    }).L;

    const map = L.map(ref.current, { scrollWheelZoom: true });
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 16,
        attribution: "Tiles &copy; Esri",
      }
    ).addTo(map);
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16, opacity: 0.9 }
    ).addTo(map);

    let first = true;
    for (const p of pins) {
      const m = L.circleMarker([p.lat, p.lng], {
        radius: 5,
        color: COLORS[p.category] ?? "#e0a458",
        fillOpacity: 0.85,
        weight: 1,
      });
      m.addTo(map);
      const safeUrl = safeHttpUrl(p.website);
      m.bindPopup(
        `<b>${escHtml(p.name)}</b><br/>${escHtml(LABELS[p.category] ?? p.category)}<br/>${
          p.city ? escHtml(p.city) + ", " : ""
        }${escHtml(p.state)}${p.phone ? "<br/>Phone: " + escHtml(p.phone) : ""}${
          safeUrl
            ? `<br/><a href="${escHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">website</a>`
            : ""
        }`
      );
      if (first) {
        map.setView([p.lat, p.lng], 5);
        first = false;
      }
    }
    if (first) map.setView([39.5, -98.35], 4);
    return () => {
      map.remove();
    };
  }, [ready, pins]);

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {Object.entries(LABELS).map(([id, label]) => (
          <span
            key={id}
            className="flex items-center gap-1.5 font-mono text-xs tracking-[0.12em] text-cream/70"
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: COLORS[id] }}
            />
            {label.toUpperCase()}
          </span>
        ))}
      </div>
      {failed ? (
        <div className="mt-4 rounded-xl border border-line bg-panel p-6 font-mono text-xs text-cream/70">
          Map tiles could not load on this network — CSV export and state tables still work normally.
        </div>
      ) : (
        <div
          ref={ref}
          className="mt-4 h-[62vh] min-h-[420px] w-full rounded-xl border border-line bg-ink"
        />
      )}
    </div>
  );
}
