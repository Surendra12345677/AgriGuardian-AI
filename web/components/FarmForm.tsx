"use client";

import { useEffect, useState } from "react";
import { api, type Farm } from "@/lib/api";
import LocationPicker from "./LocationPicker";
import NumericField from "./NumericField";
import Select from "./Select";

const WATER = ["LOW", "MEDIUM", "HIGH"] as const;
const SOIL  = ["LOAM", "CLAY", "SANDY", "BLACK", "RED"] as const;

const WATER_LABELS: Record<typeof WATER[number], string> = {
  LOW: "Low — rain-fed only",
  MEDIUM: "Medium — seasonal irrigation",
  HIGH: "High — full irrigation",
};
const SOIL_LABELS: Record<typeof SOIL[number], string> = {
  LOAM:  "Loam — balanced",
  CLAY:  "Clay — heavy, wet",
  SANDY: "Sandy — dry, fast drain",
  BLACK: "Black Soil (Black Cotton) — rich, expansive",
  RED:   "Red Laterite — acidic, light",
};

export default function FarmForm({
  onCreated,
  selected,
}: {
  onCreated: (f: Farm) => void;
  selected?: Farm;
}) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOk]    = useState<string | null>(null);

  const [form, setForm] = useState({
    farmerName:        "",
    contact:           "",
    latitude:          18.52,
    longitude:         73.85,
    landSizeAcres:     2,
    waterAvailability: "MEDIUM",
    soilType:          "BLACK",
    budgetInr:         50000,
  });

  useEffect(() => {
    if (!selected) return;
    setForm(prev => ({
      ...prev,
      latitude:          selected.latitude,
      longitude:         selected.longitude,
      landSizeAcres:     selected.landSizeAcres,
      waterAvailability: selected.waterAvailability,
      soilType:          selected.soilType,
      budgetInr:         selected.budgetInr,
    }));
  }, [selected?.id]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.farmerName.trim()) {
      setError("Please enter the farmer name.");
      return;
    }
    setBusy(true); setError(null); setOk(null);
    try {
      const created = await api.createFarm(form);
      onCreated(created);
      setOk(`✓ Farm "${created.farmerName}" saved — continue to Plan →`);
      set("farmerName", "");
      set("contact", "");
    } catch (err: any) {
      setError(err.message ?? "Save failed — is the backend running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="card overflow-hidden">
        {/* ── Header ── */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-slate-100 text-lg flex items-center gap-2">
              <span>🌾</span> Add a new farm
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Fill in the details on the left, then pin your field on the map.
            </p>
          </div>
          {selected && (
            <div className="text-[11px] text-slate-500 font-mono">
              Ref: {selected.farmerName}
            </div>
          )}
        </div>

        {/* ── Two-column body: fields (left) + map (right) ── */}
        <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/5">

          {/* LEFT: all form fields */}
          <div className="p-5 space-y-4">
            {/* Farmer identity */}
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-widest text-emerald-300/70 font-semibold">
                Farmer identity
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Full name" required>
                  <input
                    className="input"
                    placeholder="e.g. Ramesh Kumar"
                    value={form.farmerName}
                    onChange={e => set("farmerName", e.target.value)}
                  />
                </Field>
                <Field label="Phone (optional)">
                  <input
                    className="input"
                    placeholder="+91-9876543210"
                    value={form.contact}
                    onChange={e => set("contact", e.target.value)}
                  />
                </Field>
              </div>
            </div>

            {/* Field characteristics */}
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-widest text-emerald-300/70 font-semibold">
                Field details
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Land size (acres)">
                  <NumericField
                    value={form.landSizeAcres} min={0.1} step={0.5}
                    onChange={n => set("landSizeAcres", n)}
                  />
                </Field>
                <Field label="Budget (₹ INR)">
                  <NumericField
                    value={form.budgetInr} min={0} step={500}
                    onChange={n => set("budgetInr", n)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Water availability">
                  <Select
                    value={form.waterAvailability as typeof WATER[number]}
                    options={WATER}
                    displayMap={WATER_LABELS}
                    onChange={v => set("waterAvailability", v)}
                  />
                </Field>
                <Field label="Soil type">
                  <Select
                    value={form.soilType as typeof SOIL[number]}
                    options={SOIL}
                    displayMap={SOIL_LABELS}
                    onChange={v => set("soilType", v)}
                  />
                </Field>
              </div>
            </div>

            {/* Coordinates readout */}
            <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-slate-500">📍 Selected coordinates</span>
              <span className="font-mono text-xs text-emerald-300">
                {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
              </span>
            </div>

            {/* Submit */}
            <div className="pt-1 flex items-center gap-3 flex-wrap">
              {error && (
                <p className="text-sm text-red-300 flex-1">{error}</p>
              )}
              {okMsg && (
                <p className="text-sm text-emerald-300 flex-1">{okMsg}</p>
              )}
              <button
                disabled={busy}
                className="btn-primary ml-auto"
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <Spinner /> Saving…
                  </span>
                ) : "Save farm & continue →"}
              </button>
            </div>
          </div>

          {/* RIGHT: map */}
          <div className="p-5 flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-widest text-emerald-300/70 font-semibold">
              Field location
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Search for your village, use GPS, or click the map to drop the pin.
              The AI uses these exact coordinates for weather, soil and market data.
            </p>
            <LocationPicker
              value={{ lat: form.latitude, lon: form.longitude }}
              onChange={p => { set("latitude", p.lat); set("longitude", p.lon); }}
              height="h-72"
            />
          </div>
        </div>
      </div>
    </form>
  );
}

function Field({ label, required, children }:
  { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="label">
        {label}{required && <span className="text-red-400"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
