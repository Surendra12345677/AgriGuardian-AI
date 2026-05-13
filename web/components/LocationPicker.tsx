"use client";

import { useEffect, useRef, useState } from "react";

// Lazy-load Leaflet from CDN once across the app.
let leafletLoading: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("ssr");
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    css.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    css.crossOrigin = "";
    document.head.appendChild(css);

    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    s.crossOrigin = "";
    s.onload = () => resolve((window as any).L);
    s.onerror = reject;
    document.body.appendChild(s);
  });
  return leafletLoading;
}

type Point = { lat: number; lon: number; label?: string };
type Mode = "gps" | "search" | "manual";

const MODES: { key: Mode; icon: string; label: string; sub: string }[] = [
  { key: "gps",    icon: "📍", label: "Use my location", sub: "Browser GPS — most accurate" },
  { key: "search", icon: "🔍", label: "Search address",  sub: "Village, district or pincode" },
  { key: "manual", icon: "🗺️", label: "Pick on map",     sub: "Click or drag the pin" },
];

export default function LocationPicker({
  value,
  onChange,
  height = "h-80",
}: {
  value: Point;
  onChange: (p: Point) => void;
  height?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("search");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err" | "info"; msg: string } | null>(null);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);

  // init map
  useEffect(() => {
    let disposed = false;
    loadLeaflet().then(L => {
      if (disposed || !elRef.current) return;
      const map = L.map(elRef.current, {
        center: [value.lat, value.lon],
        zoom: 12,
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        },
      ).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: `
          <div style="
            width:22px;height:22px;border-radius:50%;
            background:radial-gradient(circle at 30% 30%, #6ee7b7, #10b981);
            border:2px solid #022c22;
            box-shadow:0 0 0 4px rgba(16,185,129,0.25), 0 4px 14px rgba(0,0,0,0.5);
          "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker([value.lat, value.lon], { draggable: true, icon }).addTo(map);

      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        onChange({ lat: ll.lat, lon: ll.lng });
        setResolvedLabel(null);
      });
      map.on("click", (e: any) => {
        marker.setLatLng(e.latlng);
        onChange({ lat: e.latlng.lat, lon: e.latlng.lng });
        setResolvedLabel(null);
      });

      mapRef.current = map;
      markerRef.current = marker;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 50);
    });
    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !markerRef.current) return;
    const cur = markerRef.current.getLatLng();
    if (Math.abs(cur.lat - value.lat) > 1e-6 || Math.abs(cur.lng - value.lon) > 1e-6) {
      markerRef.current.setLatLng([value.lat, value.lon]);
      mapRef.current.setView([value.lat, value.lon], mapRef.current.getZoom());
    }
  }, [value.lat, value.lon, ready]);

  useEffect(() => {
    if (mapRef.current) setTimeout(() => mapRef.current.invalidateSize(), 60);
  }, [mode]);

  async function geocode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!search.trim()) return;
    setSearching(true); setStatus(null);
    try {
      const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q="
                  + encodeURIComponent(search.trim());
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      const j: { lat: string; lon: string; display_name: string }[] = await r.json();
      if (!j.length) { setStatus({ kind: "err", msg: "No match found." }); return; }
      const lat = parseFloat(j[0].lat), lon = parseFloat(j[0].lon);
      onChange({ lat, lon, label: j[0].display_name });
      setResolvedLabel(j[0].display_name);
      mapRef.current?.setView([lat, lon], 13);
      setStatus({ kind: "ok", msg: "Located." });
    } catch {
      setStatus({ kind: "err", msg: "Search failed — check your connection." });
    } finally {
      setSearching(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus({ kind: "err", msg: "Geolocation unsupported in this browser." });
      return;
    }
    setStatus({ kind: "info", msg: "Requesting GPS permission…" });
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        onChange({ lat, lon });
        setResolvedLabel(null);
        mapRef.current?.setView([lat, lon], 14);
        setStatus({
          kind: "ok",
          msg: `Locked: ${lat.toFixed(4)}, ${lon.toFixed(4)} (±${Math.round(pos.coords.accuracy)}m)`,
        });
      },
      err => setStatus({
        kind: "err",
        msg: err.code === 1
          ? "Permission denied. Enable location for this site in your browser."
          : "Could not get your location.",
      }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1.5">
        {MODES.map(m => {
          const active = mode === m.key;
          return (
            <button key={m.key} type="button" onClick={() => setMode(m.key)}
                    className={
                      "rounded-lg px-2.5 py-2 text-left transition " +
                      (active
                        ? "bg-emerald-400/[0.10] border border-emerald-400/40"
                        : "border border-transparent hover:bg-white/[0.04]")
                    }>
              <div className="flex items-center gap-1.5">
                <span>{m.icon}</span>
                <span className={"text-xs font-semibold " + (active ? "text-emerald-100" : "text-slate-200")}>
                  {m.label}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{m.sub}</div>
            </button>
          );
        })}
      </div>

      {mode === "gps" && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3 flex-wrap">
          <button type="button" onClick={useMyLocation} className="btn-primary text-sm">
            📍 Detect my location
          </button>
          <p className="text-xs text-slate-400 leading-snug flex-1 min-w-[200px]">
            Uses your browser&apos;s GPS. The pin on the map will jump to your current coordinates.
          </p>
        </div>
      )}

      {mode === "search" && (
        <form onSubmit={geocode} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="e.g. Wardha, Maharashtra · 442001 · Krishi Bhavan…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="submit" disabled={searching || !search.trim()} className="btn-primary text-sm">
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Powered by OpenStreetMap. Try a village, taluka, district, or 6-digit pincode.
          </p>
        </form>
      )}

      {mode === "manual" && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs text-slate-400 leading-snug">
            <span className="text-slate-200 font-medium">Click anywhere on the map</span> to drop the pin,
            or <span className="text-slate-200 font-medium">drag the existing pin</span> to fine-tune the field boundary.
          </p>
        </div>
      )}

      <div className={`relative rounded-xl overflow-hidden border border-white/10 ${height}`}>
        <div ref={elRef} className="absolute inset-0" />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-[#06090f] text-xs text-slate-500">
            Loading map…
          </div>
        )}
        <div className="pointer-events-none absolute top-2 left-2 z-[400]
                        text-[10px] font-mono bg-black/60 text-emerald-300
                        rounded-md px-2 py-1 border border-emerald-400/30">
          {value.lat.toFixed(4)}, {value.lon.toFixed(4)}
        </div>
      </div>

      {(status || resolvedLabel) && (
        <div className="text-xs space-y-1">
          {resolvedLabel && (
            <div className="text-slate-300">
              <span className="text-slate-500">Resolved:</span> {resolvedLabel}
            </div>
          )}
          {status && (
            <div className={
              status.kind === "ok"  ? "text-emerald-300"
              : status.kind === "err" ? "text-amber-300"
              : "text-slate-400"
            }>
              {status.msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
