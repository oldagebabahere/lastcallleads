"use client";

import { useEffect, useRef, useState } from "react";

export default function VenueMiniMap({
  lat,
  lng,
  label,
}: {
  lat: number;
  lng: number;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

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
    if (!document.querySelector('link[data-leaflet="1"]')) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.dataset.leaflet = "1";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    const existing = document.querySelector('script[data-leaflet="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => {
        if (!cancelled) setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }
    const s = document.createElement("script");
    s.dataset.leaflet = "1";
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => {
      if (!cancelled) setReady(true);
    };
    document.body.appendChild(s);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !ref.current || !(window as unknown as { L?: unknown }).L) return;
    const L = (
      window as unknown as {
        L: {
          map: (el: HTMLElement, opts: object) => {
            setView: (c: [number, number], z: number) => void;
            remove: () => void;
          };
          tileLayer: (url: string, opts: object) => { addTo: (m: unknown) => void };
          circleMarker: (c: [number, number], opts: object) => { addTo: (m: unknown) => void };
        };
      }
    ).L;
    const map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
    }).addTo(map);
    L.circleMarker([lat, lng], {
      radius: 9,
      color: "#ffffff",
      fillColor: "#e0aa4a",
      fillOpacity: 0.95,
      weight: 2,
    }).addTo(map);
    map.setView([lat, lng], 14);
    return () => {
      map.remove();
    };
  }, [ready, lat, lng]);

  return (
    <div
      ref={ref}
      aria-label={`Location map for ${label}`}
      className="h-52 w-full overflow-hidden rounded-lg border border-line bg-ink"
    />
  );
}
