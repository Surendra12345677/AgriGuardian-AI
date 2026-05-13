"use client";

import { useEffect, useRef, useState } from "react";

// Re-use the same Leaflet loader as LocationPicker.
let leafletLoading: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("ssr");
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve((window as any).L);
    s.onerror = reject;
    document.body.appendChild(s);
  });
  return leafletLoading;
}

/** Compact read-only farm location card. */
export default function FarmMap({ lat, lon }: { lat: number; lon: number }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    loadLeaflet().then(L => {
      if (disposed || !elRef.current) return;
      const map = L.map(elRef.current, {
        center: [lat, lon], zoom: 11,
        zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:50%;
                 background:radial-gradient(circle at 30% 30%, #6ee7b7, #10b981);
                 border:2px solid #022c22;
                 box-shadow:0 0 0 4px rgba(16,185,129,0.25);"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      });
      markerRef.current = L.marker([lat, lon], { icon }).addTo(map);
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 50);
    });
    return () => { disposed = true; mapRef.current?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([lat, lon]);
    mapRef.current.setView([lat, lon], mapRef.current.getZoom());
  }, [lat, lon, ready]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <span className="label">Location</span>
        <span className="text-[11px] font-mono text-emerald-300">
          {lat.toFixed(3)}, {lon.toFixed(3)}
        </span>
      </div>
      <div ref={elRef} className="relative h-44 bg-[#06090f]" />
    </div>
  );
}
