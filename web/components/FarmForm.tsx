"use client";

import { useEffect, useState } from "react";
import { api, type Farm } from "@/lib/api";
import LocationPicker from "./LocationPicker";

const WATER = ["LOW", "MEDIUM", "HIGH"] as const;
const SOIL  = ["LOAM", "CLAY", "SANDY", "BLACK", "RED"] as const;

export default function FarmForm({
  onCreated,
  selected,
}: {
  onCreated: (f: Farm) => void;
  /** When the user picks an existing farm in the right-hand list, the
   *  form's location + profile fields jump to that farm so the map below
   *  always matches what's selected. */
  selected?: Farm;
}) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOk]    = useState<string | null>(null);

  const [form, setForm] = useState({
    farmerName: "",
    contact: "",
    latitude: 18.52,
    longitude: 73.85,
    landSizeAcres: 2,
    waterAvailability: "MEDIUM",
    soilType: "BLACK",
    budgetInr: 50000,
  });

  // Sync the LocationPicker (and field profile) to the currently-selected
  // farm so what's on the map matches what's in the right-hand sidebar.
  // We deliberately leave farmerName/contact empty so the user knows this
  // form is for ADDING A NEW farm — the location just starts from the
  // selected farm as a sensible reference point.
  useEffect(() => {
    if (!selected) return;
    setForm(prev => ({
      ...prev,
      latitude: selected.latitude,
      longitude: selected.longitude,
      landSizeAcres: selected.landSizeAcres,
      waterAvailability: selected.waterAvailability,
      soilType: selected.soilType,
      budgetInr: selected.budgetInr,
    }));
  }, [selected?.id]); // re-run only when the chosen farm changes

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.farmerName.trim()) {
      setError("Farmer name is required.");
      return;
    }
    setBusy(true); setError(null); setOk(null);
    try {
      const created = await api.createFarm(form);
      onCreated(created);
      setOk(`Farm “${created.farmerName}” saved. Scroll down to plan the season.`);
      set("farmerName", "");
      set("contact", "");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* ── CARD 1 · Farmer + field profile ─────────────────────────────── */}
      <div className="card p-5 lg:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80 font-semibold">
              Part A
            </div>
            <h3 className="font-semibold text-slate-100 text-lg flex items-center gap-2 mt-1">
              <span aria-hidden>👤</span> Farmer & field profile
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 max-w-md">
              Identity, plot size, soil, water and budget. The agent uses these to choose
              a crop and size the impact numbers.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Farmer name" required>
            <input className="input" value={form.farmerName}
                   placeholder="Your full name"
                   onChange={e => set("farmerName", e.target.value)} />
          </Field>
          <Field label="Contact (optional)">
            <input className="input" value={form.contact}
                   placeholder="+91-…"
                   onChange={e => set("contact", e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Land (acres)">
            <input className="input" type="number" step="0.1" min="0.1" value={form.landSizeAcres}
                   onChange={e => set("landSizeAcres", Number(e.target.value))} />
          </Field>
          <Field label="Budget (INR)">
            <input className="input" type="number" step="500" min="0" value={form.budgetInr}
                   onChange={e => set("budgetInr", Number(e.target.value))} />
          </Field>
          <Field label="Water availability">
            <select className="input" value={form.waterAvailability}
                    onChange={e => set("waterAvailability", e.target.value)}>
              {WATER.map(w => <option key={w}>{w}</option>)}
            </select>
          </Field>
          <Field label="Soil type">
            <select className="input" value={form.soilType}
                    onChange={e => set("soilType", e.target.value)}>
              {SOIL.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* ── CARD 2 · Location (separate card so it's not confused with the profile) ── */}
      <div className="card p-5 lg:p-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80 font-semibold">
              Part B
            </div>
            <h3 className="font-semibold text-slate-100 text-lg flex items-center gap-2 mt-1">
              <span aria-hidden>📍</span> Field location
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 max-w-md">
              {selected
                ? <>The map is showing <span className="text-emerald-300 font-medium">{selected.farmerName}</span>&apos;s field. Drag the pin to set a different point for a NEW farm, or just leave it and change the name above to clone.</>
                : <>Pick the exact GPS point of this field. Weather, soil and price tools all key off these coordinates — changing them changes the recommendation.</>
              }
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Current point</div>
            <div className="font-mono text-xs text-slate-200">
              {form.latitude.toFixed(4)}, {form.longitude.toFixed(4)}
            </div>
          </div>
        </div>
        <LocationPicker
          value={{ lat: form.latitude, lon: form.longitude }}
          onChange={p => { set("latitude", p.lat); set("longitude", p.lon); }}
        />
      </div>

      {/* ── Submit row ──────────────────────────────────────────────────── */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="text-xs text-slate-400">
          Saving creates a farm record the planner, what-if and plant-doctor steps will use.
        </div>
        <div className="ml-auto flex items-center gap-3">
          {error && <p className="text-sm text-red-300">{error}</p>}
          {okMsg && <p className="text-sm text-emerald-300">{okMsg}</p>}
          <button disabled={busy} className="btn-primary">
            {busy ? "Saving…" : "Save farm & continue"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, required, children }:
  { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="label">{label}{required && <span className="text-red-400"> *</span>}</span>
      {children}
    </label>
  );
}
