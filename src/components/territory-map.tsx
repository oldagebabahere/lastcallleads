"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckSquare, LockKeyhole, MapPin, Navigation, Route, Square, Sparkles } from "lucide-react";

export type TerritoryPin = {
  id: number;
  state: string;
  eventType: string;
  displayName: string;
  locked: boolean;
  city: string | null;
  county: string | null;
  address: string | null;
  zip: string | null;
  typeName: string | null;
  archetype: string;
  estSpend?: string;
  score: number;
  lat: number;
  lng: number;
  dateLabel: string;
  unlockHref: string;
};

function escHtml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pinColor(eventType: string): string {
  if (eventType === "NEW_PENDING") return "#e0aa4a";
  if (eventType === "NEW_LICENSE") return "#7dc98f";
  return "#c4435a";
}

type LeafletMapHandle = {
  setView: (c: [number, number], z: number) => void;
  fitBounds: (b: [number, number][], opts?: object) => void;
  remove: () => void;
};
type LeafletMarkerHandle = {
  addTo: (m: unknown) => void;
  bindPopup: (h: string) => void;
  openPopup: () => void;
};

export default function TerritoryMap({
  pins,
  isSubscriberView,
}: {
  pins: TerritoryPin[];
  isSubscriberView: boolean;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMapHandle | null>(null);
  const markersRef = useRef<Map<number, LeafletMarkerHandle>>(new Map());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    pins
      .filter((p) => !p.locked)
      .slice(0, 5)
      .map((p) => p.id)
  );

  // Keep selectedIds synced with current visible pins when filter changes
  const validSelected = useMemo(() => {
    const idSet = new Set(pins.filter((p) => !p.locked).map((p) => p.id));
    return selectedIds.filter((id) => idSet.has(id));
  }, [pins, selectedIds]);

  const toggleStop = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 8) return prev;
      return [...prev, id];
    });
  };

  const focusPin = (pin: TerritoryPin) => {
    setActiveId(pin.id);
    const map = mapInstanceRef.current;
    const marker = markersRef.current.get(pin.id);
    if (map) {
      map.setView([pin.lat, pin.lng], 12);
    }
    if (marker) {
      marker.openPopup();
    }
  };

  const autoPickTop = () => {
    const top = [...pins]
      .filter((p) => !p.locked)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((p) => p.id);
    setSelectedIds(top);
  };

  // Multi-stop Google Maps driving route URL (zero API billing!)
  const googleRouteUrl = useMemo(() => {
    const chosen = pins.filter((p) => validSelected.includes(p.id));
    if (chosen.length === 0) return null;
    const stops = chosen.map((p) =>
      [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ") ||
      `${p.displayName} ${p.city ?? ""} ${p.state}`
    );
    if (stops.length === 1) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stops[0])}`;
    }
    return `https://www.google.com/maps/dir/${stops.map((s) => encodeURIComponent(s)).join("/")}`;
  }, [pins, validSelected]);

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
    s.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    document.body.appendChild(s);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !(window as unknown as { L?: unknown }).L) return;
    const L = (
      window as unknown as {
        L: {
          map: (el: HTMLElement, opts: object) => LeafletMapHandle;
          tileLayer: (url: string, opts: object) => { addTo: (m: unknown) => void };
          circleMarker: (c: [number, number], opts: object) => LeafletMarkerHandle;
        };
      }
    ).L;

    const map = L.map(mapRef.current, { scrollWheelZoom: false });
    mapInstanceRef.current = map;

    // 100% free, zero-API-key, zero-watermark Esri World Dark Gray Canvas + Road/City Labels
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 16,
        attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
      }
    ).addTo(map);
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 16,
        opacity: 0.9,
      }
    ).addTo(map);

    const markerMap = new Map<number, LeafletMarkerHandle>();
    const bounds: [number, number][] = [];
    for (const p of pins) {
      const color = pinColor(p.eventType);
      const isSelected = validSelected.includes(p.id);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: isSelected ? 8 : p.score >= 70 ? 7 : 5.5,
        color: isSelected ? "#ffffff" : "#140b0e",
        fillColor: color,
        fillOpacity: 0.94,
        weight: isSelected ? 2.2 : 1.2,
      });
      marker.addTo(map);

      const addrText = !p.locked && p.address ? `${p.address}, ` : "";
      const locText = [p.city, p.state].filter(Boolean).join(", ");
      const signalLabel =
        p.eventType === "NEW_PENDING"
          ? "APPLICATION FILED"
          : p.eventType === "NEW_LICENSE"
            ? "LICENSE ISSUED"
            : "STATUS UPDATE";
      const mapsLink = !p.locked
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            [p.address, p.city, p.state, p.zip].filter(Boolean).join(" ") ||
              `${p.displayName} ${locText}`
          )}`
        : null;

      marker.bindPopup(
        `<div style="font-family:system-ui,sans-serif;min-width:210px;color:#140b0e">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:#8c4a14">${escHtml(signalLabel)} · SCORE ${p.score}/100</div>
          <div style="font-size:15px;font-weight:700;margin-top:3px">${escHtml(p.displayName)}</div>
          <div style="font-size:12px;color:#444;margin-top:2px">${escHtml(addrText + locText)}</div>
          <div style="font-size:11px;color:#555;margin-top:3px">${escHtml(p.archetype)}${p.estSpend ? ` · <strong>${escHtml(p.estSpend)}</strong>` : ""}</div>
          <div style="margin-top:9px;display:flex;gap:12px;font-size:11px;font-weight:700">
            <a href="${escHtml(p.unlockHref)}" style="color:#7a2b3e;text-decoration:underline">${p.locked ? "Unlock Dossier →" : "Open Dossier & Script →"}</a>
            ${mapsLink ? `<a href="${escHtml(mapsLink)}" target="_blank" rel="noopener noreferrer" style="color:#0b57d0;text-decoration:underline">Google Maps ↗</a>` : ""}
          </div>
        </div>`
      );
      markerMap.set(p.id, marker);
      bounds.push([p.lat, p.lng]);
    }
    markersRef.current = markerMap;

    if (bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 11 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 11);
    } else {
      map.setView([39.5, -98.35], 4);
    }

    return () => {
      mapInstanceRef.current = null;
      markersRef.current.clear();
      map.remove();
    };
  }, [ready, pins, validSelected]);

  const unlockedCount = pins.filter((p) => !p.locked).length;

  return (
    <div className="space-y-5">
      {/* Legend + 1-Click Route Builder Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber/35 bg-panel p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-cream/90">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e0aa4a]" /> FILED (60–90d WINDOW)
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-cream/90">
            <span className="h-2.5 w-2.5 rounded-full bg-[#7dc98f]" /> ISSUED
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-cream/90">
            <span className="h-2.5 w-2.5 rounded-full bg-[#c4435a]" /> STATUS FLIP
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unlockedCount > 0 && (
            <button
              type="button"
              onClick={autoPickTop}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-ink px-3 py-2 font-mono text-[10px] tracking-[0.12em] text-smoke hover:border-amber/50 hover:text-amber"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber" />
              AUTO-PICK TOP {Math.min(8, unlockedCount)}
            </button>
          )}
          {googleRouteUrl ? (
            <a
              href={googleRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-amber px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-[#140b0e] transition-transform hover:scale-[1.02]"
            >
              <Navigation className="h-3.5 w-3.5" />
              OPEN GOOGLE MAPS ROUTE ({validSelected.length} STOP{validSelected.length === 1 ? "" : "S"}) ↗
            </a>
          ) : (
            <Link
              href="/#pricing"
              className="inline-flex items-center gap-1.5 rounded-md bg-amber px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-[#140b0e]"
            >
              <Route className="h-3.5 w-3.5" /> UNLOCK LIVE ROUTE PLANNER →
            </Link>
          )}
        </div>
      </div>

      {/* Map + Interactive Route Stop List */}
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-xl border border-line bg-[#1a1a1a]">
          {failed ? (
            <div className="flex h-[540px] flex-col items-center justify-center p-6 text-center">
              <MapPin className="h-7 w-7 text-amber" />
              <p className="mt-3 text-sm text-cream">Map tiles unavailable on this connection.</p>
              <p className="mt-1 font-mono text-xs text-smoke">
                You can still select stops on the right and launch your multi-stop Google Maps
                driving route directly.
              </p>
            </div>
          ) : (
            <div ref={mapRef} className="h-[520px] w-full lg:h-[600px]" />
          )}
        </div>

        {/* Selectable Venue Stop List (Ranked Highest Score First!) */}
        <div className="flex h-[520px] flex-col overflow-hidden rounded-xl border border-line bg-panel lg:h-[600px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-mono text-[10px] tracking-[0.18em] text-amber">
              PRIORITY ROUTE STOPS ({validSelected.length}/8)
            </span>
            <span className="font-mono text-[10px] text-faint">
              {isSubscriberView ? "RANKED BY SCORE" : `${pins.length} PINS`}
            </span>
          </div>
          <div className="flex-1 divide-y divide-line/60 overflow-y-auto">
            {pins.map((p) => {
              const checked = validSelected.includes(p.id);
              const isFocused = activeId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => focusPin(p)}
                  className={`flex cursor-pointer items-start gap-2.5 px-3.5 py-3 transition-colors ${
                    isFocused
                      ? "bg-amber/15"
                      : checked
                        ? "bg-amber/8"
                        : "hover:bg-panel2/50"
                  }`}
                >
                  {p.locked ? (
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
                  ) : (
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggleStop(p.id);
                      }}
                      aria-label={`Toggle ${p.displayName} in Google Maps route`}
                      className="mt-0.5 shrink-0 text-amber"
                    >
                      {checked ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4 text-smoke" />
                      )}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={p.unlockHref}
                        onClick={(ev) => ev.stopPropagation()}
                        className={`truncate text-sm font-medium hover:text-amber ${
                          p.locked ? "locked-name text-smoke" : "text-cream"
                        }`}
                      >
                        {p.displayName}
                      </Link>
                      <span className="shrink-0 rounded-full border border-amber/40 bg-amber/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber">
                        {p.score}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-smoke">
                      {!p.locked && p.address ? `${p.address} · ` : ""}
                      {[p.city, p.state].filter(Boolean).join(", ")}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-faint">
                      {p.archetype}
                      {p.estSpend ? ` · ${p.estSpend}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-line bg-ink/70 px-4 py-3 font-mono text-[10px] text-smoke">
            Click any venue to locate on map · check up to 8 stops →{" "}
            <span className="text-amber">OPEN GOOGLE MAPS ROUTE</span>.
          </div>
        </div>
      </div>
    </div>
  );
}
