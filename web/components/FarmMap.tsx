"use client";

/** Tiny no-key map preview using OpenStreetMap embed. */
export default function FarmMap({ lat, lon }: { lat: number; lon: number }) {
  const d = 0.06; // viewport size in degrees
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const src =
    `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}` +
    `&layer=mapnik&marker=${lat},${lon}`;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <span className="label">Location</span>
        <span className="text-[11px] font-mono text-slate-500">
          {lat.toFixed(3)}, {lon.toFixed(3)}
        </span>
      </div>
      <div className="relative">
        <iframe
          title="farm-map"
          src={src}
          className="w-full h-56 grayscale-[35%] contrast-110 brightness-90"
          loading="lazy"
        />
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />
      </div>
    </div>
  );
}

