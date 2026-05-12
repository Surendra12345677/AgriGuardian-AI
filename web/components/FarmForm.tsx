"use client";

import { useState } from "react";
import { api, type Farm } from "@/lib/api";

const WATER = ["LOW", "MEDIUM", "HIGH"] as const;
const SOIL  = ["LOAM", "CLAY", "SANDY", "BLACK", "RED"] as const;

export default function FarmForm({ onCreated }: { onCreated: (f: Farm) => void }) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    farmerName: "",
    contact: "",
    latitude: 18.52,
    longitude: 73.85,
    landSizeAcres: 2,
    waterAvailability: "MEDIUM",
    soilType: "BLACK",
    budgetInr: 50000
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const created = await api.createFarm(form);
      onCreated(created);
      set("farmerName", "");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-white/80 rounded-xl shadow-sm border
                                       border-emerald-100 p-5 space-y-4">
      <h2 className="font-semibold text-emerald-800 text-lg">Onboard a farm</h2>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Farmer name" required>
          <input className={inp} value={form.farmerName}
                 onChange={e => set("farmerName", e.target.value)} />
        </Field>
        <Field label="Contact (optional)">
          <input className={inp} value={form.contact}
                 onChange={e => set("contact", e.target.value)} />
        </Field>
        <Field label="Latitude">
          <input className={inp} type="number" step="0.0001" value={form.latitude}
                 onChange={e => set("latitude", Number(e.target.value))} />
        </Field>
        <Field label="Longitude">
          <input className={inp} type="number" step="0.0001" value={form.longitude}
                 onChange={e => set("longitude", Number(e.target.value))} />
        </Field>
        <Field label="Land size (acres)">
          <input className={inp} type="number" step="0.1" value={form.landSizeAcres}
                 onChange={e => set("landSizeAcres", Number(e.target.value))} />
        </Field>
        <Field label="Budget (INR)">
          <input className={inp} type="number" step="500" value={form.budgetInr}
                 onChange={e => set("budgetInr", Number(e.target.value))} />
        </Field>
        <Field label="Water availability">
          <select className={inp} value={form.waterAvailability}
                  onChange={e => set("waterAvailability", e.target.value)}>
            {WATER.map(w => <option key={w}>{w}</option>)}
          </select>
        </Field>
        <Field label="Soil type">
          <select className={inp} value={form.soilType}
                  onChange={e => set("soilType", e.target.value)}>
            {SOIL.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button disabled={busy}
              className="w-full rounded-lg bg-leaf-600 hover:bg-leaf-700 text-white
                         font-medium py-2 disabled:opacity-50">
        {busy ? "Saving…" : "Create farm"}
      </button>
    </form>
  );
}

const inp = "w-full rounded-md border border-emerald-200 bg-white/70 px-3 py-2 text-sm "
          + "focus:outline-none focus:ring-2 focus:ring-leaf-500";

function Field({ label, required, children }:
  { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="text-xs text-slate-600 space-y-1 block">
      <span>{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  );
}

