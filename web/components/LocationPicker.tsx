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

export default function LocationPicker({
  value,
  onChange,
  height = "h-72",
}: {
  value: Point;
  onChange: (p: Point) => void;
  height?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  // init
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

      // Custom emerald marker via DivIcon — no broken default-icon paths.
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
      });
      map.on("click", (e: any) => {
        marker.setLatLng(e.latlng);
        onChange({ lat: e.latlng.lat, lon: e.latlng.lng });
      });

      mapRef.current = map;
      markerRef.current = marker;
      setReady(true);

      // Make sure the map sizes correctly inside grid layouts.
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

  // External value changes (e.g. selecting a different farm) → re-center.
  useEffect(() => {
    if (!ready || !mapRef.current || !markerRef.current) return;
    const cur = markerRef.current.getLatLng();
    if (Math.abs(cur.lat - value.lat) > 1e-6 || Math.abs(cur.lng - value.lon) > 1e-6) {
      markerRef.current.setLatLng([value.lat, value.lon]);
      mapRef.current.setView([value.lat, value.lon], mapRef.current.getZoom());
    }
  }, [value.lat, value.lon, ready]);

  async function geocode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!search.trim()) return;
    setSearching(true); setSearchErr(null);
    try {
      const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q="
                  + encodeURIComponent(search.trim());
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      const j: { lat: string; lon: string; display_name: string }[] = await r.json();
      if (!j.length) { setSearchErr("No match found."); return; }
      const lat = parseFloat(j[0].lat), lon = parseFloat(j[0].lon);
      onChange({ lat, lon, label: j[0].display_name });
      mapRef.current?.setView([lat, lon], 13);
    } catch {
      setSearchErr("Search failed — check your connection.");
    } finally {
      setSearching(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setSearchErr("Geolocation unsupported."); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        onChange({ lat, lon });
        mapRef.current?.setView([lat, lon], 14);
      },
      () => setSearchErr("Permission denied or unavailable."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="space-y-2">
      <form onSubmit={geocode} className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Search a village, district or pincode…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button type="submit" disabled={searching || !search.trim()} className="btn-ghost text-sm">
          {searching ? "…" : "Search"}
        </button>
        <button type="button" onClick={useMyLocation} className="btn-ghost text-sm" title="Use my location">
          📍
        </button>
      </form>

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
        <div className="pointer-events-none absolute bottom-2 right-2 z-[400]
                        text-[10px] text-slate-400 bg-black/40 rounded px-1.5 py-0.5">
          click or drag pin to set
        </div>
      </div>

      {searchErr && <p className="text-xs text-amber-300">{searchErr}</p>}
    </div>
  );
}

