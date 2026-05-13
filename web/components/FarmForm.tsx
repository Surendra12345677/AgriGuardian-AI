"use client";

import { useState } from "react";
import { api, type Farm } from "@/lib/api";
import LocationPicker from "./LocationPicker";

const WATER = ["LOW", "MEDIUM", "HIGH"] as const;
const SOIL  = ["LOAM", "CLAY", "SANDY", "BLACK", "RED"] as const;

export default function FarmForm({ onCreated }: { onCreated: (f: Farm) => void }) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen]   = useState(false);

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

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.farmerName.trim()) {
      setError("Farmer name is required.");
      return;
    }
    setBusy(true); setError(null);
    try {
      const created = await api.createFarm(form);
      onCreated(created);
      set("farmerName", "");
      setOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <button onClick={() => setOpen(o => !o)}
              className="w-full flex items-center justify-between text-left">
        <div>
          <h2 className="font-semibold text-slate-100 flex items-center gap-2">
            <span aria-hidden>🌾</span> Onboard a farm
          </h2>
          <p className="text-xs text-slate-400">Pick a location, set soil/water/budget.</p>
        </div>
        <span className="chip">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Farmer name" required>
              <input className="input" value={form.farmerName}
                     onChange={e => set("farmerName", e.target.value)} />
            </Field>
            <Field label="Contact (optional)">
              <input className="input" value={form.contact}
                     onChange={e => set("contact", e.target.value)} />
            </Field>
          </div>

          <div>
            <span className="label">Field location</span>
            <div className="mt-1.5">
              <LocationPicker
                value={{ lat: form.latitude, lon: form.longitude }}
                onChange={p => { set("latitude", p.lat); set("longitude", p.lon); }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Land (acres)">
              <input className="input" type="number" step="0.1" value={form.landSizeAcres}
                     onChange={e => set("landSizeAcres", Number(e.target.value))} />
            </Field>
            <Field label="Budget (INR)">
              <input className="input" type="number" step="500" value={form.budgetInr}
                     onChange={e => set("budgetInr", Number(e.target.value))} />
            </Field>
            <Field label="Water">
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

          {error && <p className="text-sm text-red-300">{error}</p>}

          <button disabled={busy} className="btn-primary w-full">
            {busy ? "Saving…" : "Create farm"}
          </button>
        </form>
      )}
    </div>
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
