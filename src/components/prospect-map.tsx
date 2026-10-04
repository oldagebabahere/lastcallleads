"use client";

// Map view — every harvested prospect as a pin. Leaflet + OpenStreetMap
// tiles load from CDN; if the network blocks them the legend + list below
// the map still work.
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
  bar: "#7bc96f",
};

const LABELS: Record<string, string> = {
  attorney: "Attorneys",
  insurance: "Insurance agents",
  beverage: "Beverage sellers",
  bar: "Bars",
};

export default function ProspectMap({ pins }: { pins: MapPin[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
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
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    let first = true;
    for (const p of pins) {
      const m = L.circleMarker([p.lat, p.lng], {
        radius: 5,
        color: COLORS[p.category] ?? "#e0a458",
        fillOpacity: 0.85,
        weight: 1,
      });
      m.addTo(map);
      m.bindPopup(
        `<b>${p.name}</b><br/>${LABELS[p.category] ?? p.category}<br/>${
          p.city ? p.city + ", " : ""
        }${p.state}${p.phone ? "<br/>☎ " + p.phone : ""}${
          p.website ? '<br/><a href="' + p.website + '" target="_blank">website</a>' : ""
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
      {/* legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(LABELS).map(([id, label]) => (
          <span key={id} className="flex items-center gap-1.5 font-mono text-xs tracking-[0.12em] text-cream/70">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[id] }} />
            {label.toUpperCase()}
          </span>
        ))}
      </div>
      {failed ? (
        <div className="mt-4 rounded-xl border border-line bg-panel p-6 font-mono text-xs text-cream/70">
          Map tiles is network pe load nahi hue — list neeche phir bhi kaam karta hai.
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
