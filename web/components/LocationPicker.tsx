"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── Lazy-load Leaflet once ─────────────────────────────────────────────── */
let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("ssr");
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
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
  return leafletPromise;
}

/* ── Types ──────────────────────────────────────────────────────────────── */
export type Point = { lat: number; lon: number; label?: string };

type NominatimResult = {
  lat: string; lon: string;
  display_name: string;
  address?: {
    village?: string; town?: string; city?: string;
    state?: string; country?: string;
  };
};

const NOMINATIM = "https://nominatim.openstreetmap.org";
const UA_HEADER  = { "Accept": "application/json", "Accept-Language": "en" };

/* ── Helpers ────────────────────────────────────────────────────────────── */
function shortLabel(r: NominatimResult): string {
  const a = r.address;
  if (!a) return r.display_name.split(",").slice(0, 3).join(", ");
  const place = a.village ?? a.town ?? a.city ?? "";
  const parts = [place, a.state, a.country].filter(Boolean);
  return parts.join(", ") || r.display_name.split(",").slice(0, 3).join(", ");
}

async function geocodeQuery(q: string): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    format: "json", limit: "6", q,
    addressdetails: "1",
    // Bias toward India but don't restrict — user might have international farms
    "accept-language": "en",
  });
  const res = await fetch(`${NOMINATIM}/search?${params}`, { headers: UA_HEADER });
  return res.json();
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      format: "json", lat: String(lat), lon: String(lon),
      addressdetails: "1", zoom: "14",
    });
    const res = await fetch(`${NOMINATIM}/reverse?${params}`, { headers: UA_HEADER });
    const j: NominatimResult = await res.json();
    return shortLabel(j);
  } catch { return null; }
}

/* ── Component ──────────────────────────────────────────────────────────── */
export default function LocationPicker({
  value,
  onChange,
  height = "h-80",
}: {
  value: Point;
  onChange: (p: Point) => void;
  height?: string;
}) {
  const elRef     = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady]           = useState(false);
  const [label, setLabel]           = useState<string>(value.label ?? "");
  const [search, setSearch]         = useState("");
  const [results, setResults]       = useState<NominatimResult[]>([]);
  const [searching, setSearching]   = useState(false);
  const [showDropdown, setDropdown] = useState(false);
  const [status, setStatus]         = useState<{ kind: "ok"|"err"|"info"; msg: string } | null>(null);
  const [manualLat, setManualLat]   = useState(value.lat.toFixed(6));
  const [manualLon, setManualLon]   = useState(value.lon.toFixed(6));
  const [tab, setTab]               = useState<"search"|"gps"|"manual">("search");

  /* ── Update manual fields when value changes externally ─────────────── */
  useEffect(() => {
    setManualLat(value.lat.toFixed(6));
    setManualLon(value.lon.toFixed(6));
  }, [value.lat, value.lon]);

  /* ── Init map ────────────────────────────────────────────────────────── */
  useEffect(() => {
    let disposed = false;
    loadLeaflet().then(L => {
      if (disposed || !elRef.current) return;

      const map = L.map(elRef.current, {
        center: [value.lat, value.lon], zoom: 13,
        zoomControl: true, attributionControl: true,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:50%;
          background:radial-gradient(circle at 30% 30%,#6ee7b7,#10b981);
          border:2px solid #022c22;
          box-shadow:0 0 0 4px rgba(16,185,129,0.25),0 4px 14px rgba(0,0,0,0.5)"></div>`,
        iconSize: [22, 22], iconAnchor: [11, 11],
      });

      const marker = L.marker([value.lat, value.lon], { draggable: true, icon }).addTo(map);

      marker.on("dragend", async () => {
        const ll = marker.getLatLng();
        onChange({ lat: ll.lat, lon: ll.lng });
        setStatus({ kind: "info", msg: "Resolving location…" });
        const lbl = await reverseGeocode(ll.lat, ll.lng);
        setLabel(lbl ?? "");
        setStatus(lbl
          ? { kind: "ok", msg: lbl }
          : { kind: "info", msg: `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}` });
      });

      map.on("click", async (e: any) => {
        marker.setLatLng(e.latlng);
        onChange({ lat: e.latlng.lat, lon: e.latlng.lng });
        setStatus({ kind: "info", msg: "Resolving location…" });
        const lbl = await reverseGeocode(e.latlng.lat, e.latlng.lng);
        setLabel(lbl ?? "");
        setStatus(lbl
          ? { kind: "ok", msg: lbl }
          : { kind: "info", msg: `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}` });
      });

      mapRef.current    = map;
      markerRef.current = marker;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 80);
    });
    return () => {
      disposed = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Sync marker when value changes ─────────────────────────────────── */
  useEffect(() => {
    if (!ready || !mapRef.current || !markerRef.current) return;
    const cur = markerRef.current.getLatLng();
    if (Math.abs(cur.lat - value.lat) > 1e-5 || Math.abs(cur.lng - value.lon) > 1e-5) {
      markerRef.current.setLatLng([value.lat, value.lon]);
      mapRef.current.setView([value.lat, value.lon], Math.max(mapRef.current.getZoom(), 13));
    }
  }, [value.lat, value.lon, ready]);

  /* ── Invalidate map size when tab changes ───────────────────────────── */
  useEffect(() => {
    if (mapRef.current) setTimeout(() => mapRef.current.invalidateSize(), 60);
  }, [tab]);

  /* ── Geocode search ─────────────────────────────────────────────────── */
  const doSearch = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true); setResults([]); setDropdown(false); setStatus(null);
    try {
      const res = await geocodeQuery(search.trim());
      if (!res.length) {
        setStatus({ kind: "err", msg: "No results found. Try a nearby district or city name." });
      } else {
        setResults(res);
        setDropdown(true);
        setStatus({ kind: "info", msg: `${res.length} result${res.length > 1 ? "s" : ""} found — pick one below` });
      }
    } catch {
      setStatus({ kind: "err", msg: "Search failed — check your connection." });
    } finally {
      setSearching(false);
    }
  }, [search]);

  function pickResult(r: NominatimResult) {
    const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
    const lbl = shortLabel(r);
    onChange({ lat, lon, label: lbl });
    setLabel(lbl);
    setDropdown(false);
    setSearch(lbl);
    mapRef.current?.setView([lat, lon], 14);
    setStatus({ kind: "ok", msg: `✓ ${lbl}` });
  }

  /* ── GPS ─────────────────────────────────────────────────────────────── */
  function useGPS() {
    if (!navigator.geolocation) {
      setStatus({ kind: "err", msg: "Geolocation not supported in this browser." }); return;
    }
    setStatus({ kind: "info", msg: "Requesting GPS — please allow location access…" });
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        onChange({ lat, lon });
        setStatus({ kind: "info", msg: "Resolving address…" });
        mapRef.current?.setView([lat, lon], 15);
        const lbl = await reverseGeocode(lat, lon);
        setLabel(lbl ?? "");
        setStatus({
          kind: "ok",
          msg: lbl
            ? `📍 ${lbl} (±${acc}m)`
            : `📍 ${lat.toFixed(5)}, ${lon.toFixed(5)} (±${acc}m)`,
        });
      },
      err => setStatus({
        kind: "err",
        msg: err.code === 1
          ? "Location permission denied. Enable it in browser settings."
          : err.code === 3
          ? "GPS timed out. Move to an open area and retry."
          : "Could not get your location.",
      }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  /* ── Manual lat/lon ──────────────────────────────────────────────────── */
  function applyManual() {
    const lat = parseFloat(manualLat), lon = parseFloat(manualLon);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setStatus({ kind: "err", msg: "Invalid coordinates. Latitude: −90…90, Longitude: −180…180." });
      return;
    }
    onChange({ lat, lon });
    mapRef.current?.setView([lat, lon], 14);
    setStatus({ kind: "ok", msg: `Set to ${lat.toFixed(5)}, ${lon.toFixed(5)}` });
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-3">

      {/* Tab bar */}
      <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1.5">
        {(["search", "gps", "manual"] as const).map(t => {
          const meta = {
            search: { icon: "🔍", label: "Search address",  sub: "Village, district, pincode" },
            gps:    { icon: "📡", label: "Detect my GPS",   sub: "Most accurate" },
            manual: { icon: "✏️",  label: "Enter coords",   sub: "Paste lat, lon" },
          }[t];
          const active = tab === t;
          return (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={"rounded-lg px-2.5 py-2 text-left transition " + (
                active
                  ? "bg-emerald-400/10 border border-emerald-400/40"
                  : "border border-transparent hover:bg-white/[0.04]"
              )}>
              <div className="flex items-center gap-1.5">
                <span>{meta.icon}</span>
                <span className={"text-xs font-semibold " + (active ? "text-emerald-100" : "text-slate-200")}>
                  {meta.label}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{meta.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Search panel */}
      {tab === "search" && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="e.g. Wardha, Maharashtra · Krishi Bhavan · 442001…"
              value={search}
              onChange={e => { setSearch(e.target.value); setDropdown(false); }}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); void doSearch(); }
                if (e.key === "Escape") setDropdown(false);
              }}
            />
            <button type="button" onClick={() => void doSearch()}
              disabled={searching || !search.trim()} className="btn-primary text-sm shrink-0">
              {searching ? "…" : "Search"}
            </button>
          </div>

          {/* Results dropdown */}
          {showDropdown && results.length > 0 && (
            <div className="rounded-lg border border-white/10 bg-slate-900 overflow-hidden divide-y divide-white/5">
              {results.map((r, i) => (
                <button key={i} type="button" onClick={() => pickResult(r)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.06] transition-colors">
                  <div className="font-medium text-slate-100">{shortLabel(r)}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 truncate">{r.display_name}</div>
                  <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                    {parseFloat(r.lat).toFixed(5)}, {parseFloat(r.lon).toFixed(5)}
                  </div>
                </button>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-600">
            Powered by OpenStreetMap Nominatim · up to 6 results shown
          </p>
        </div>
      )}

      {/* GPS panel */}
      {tab === "gps" && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3 flex-wrap">
          <button type="button" onClick={useGPS} className="btn-primary text-sm">
            📡 Detect my location
          </button>
          <p className="text-xs text-slate-400 leading-snug flex-1 min-w-[180px]">
            Uses browser GPS. Allow location access when prompted.
            The pin will jump to your exact coordinates and the address will resolve automatically.
          </p>
        </div>
      )}

      {/* Manual coords panel */}
      {tab === "manual" && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Latitude</span>
              <input className="input font-mono text-sm" placeholder="e.g. 17.4310"
                value={manualLat}
                onChange={e => setManualLat(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyManual(); } }}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Longitude</span>
              <input className="input font-mono text-sm" placeholder="e.g. 78.3809"
                value={manualLon}
                onChange={e => setManualLon(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyManual(); } }}
              />
            </label>
          </div>
          <button type="button" onClick={applyManual} className="btn-primary text-sm">
            Apply coordinates
          </button>
          <p className="text-[10px] text-slate-500">
            Tip: copy coordinates from Google Maps (right-click → copy coordinates).
          </p>
        </div>
      )}

      {/* Map — always visible */}
      <div className={`relative rounded-xl overflow-hidden border border-white/10 ${height}`}>
        <div ref={elRef} className="absolute inset-0" />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-[#06090f] text-xs text-slate-500">
            Loading map…
          </div>
        )}
        {/* Coordinates badge */}
        <div className="pointer-events-none absolute top-2 left-2 z-[400]
          text-[10px] font-mono bg-black/70 text-emerald-300
          rounded-md px-2 py-1 border border-emerald-400/20 backdrop-blur-sm">
          {value.lat.toFixed(5)}, {value.lon.toFixed(5)}
        </div>
        {/* Click hint */}
        <div className="pointer-events-none absolute bottom-2 right-2 z-[400]
          text-[10px] text-slate-500 bg-black/60 rounded px-2 py-0.5">
          Click map or drag pin to set location
        </div>
      </div>

      {/* Status / resolved label */}
      {(status || label) && (
        <div className="space-y-1 text-xs">
          {label && !status?.msg.includes(label) && (
            <div className="text-slate-300 flex items-start gap-1.5">
              <span className="text-slate-500 shrink-0">📍</span>
              <span>{label}</span>
            </div>
          )}
          {status && (
            <div className={
              status.kind === "ok"  ? "text-emerald-300" :
              status.kind === "err" ? "text-amber-300"   : "text-slate-400"
            }>
              {status.msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
