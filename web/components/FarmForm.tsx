"use client";

import { useState } from "react";
import { api, type Farm } from "@/lib/api";
import LocationPicker from "./LocationPicker";

const WATER = ["LOW", "MEDIUM", "HIGH"] as const;
const SOIL  = ["LOAM", "CLAY", "SANDY", "BLACK", "RED"] as const;

export default function FarmForm({ onCreated }: { onCreated: (f: Farm) => void }) {
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
    <form onSubmit={submit} className="card p-5 lg:p-6 space-y-5">
      <div className="grid lg:grid-cols-5 gap-6">
        {/* LEFT: form fields */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <h3 className="font-semibold text-slate-100 flex items-center gap-2">
              <span aria-hidden>👤</span> Farmer details
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Used to identify the farm record. Contact is optional.
            </p>
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

          <div className="border-t border-white/5 pt-4">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2">
              <span aria-hidden>🌱</span> Field profile
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Soil, water and budget guide the agent&apos;s crop choice.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
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

          {error && <p className="text-sm text-red-300">{error}</p>}
          {okMsg && <p className="text-sm text-emerald-300">{okMsg}</p>}

          <button disabled={busy} className="btn-primary w-full">
            {busy ? "Saving…" : "Save farm & continue"}
          </button>
        </div>

        {/* RIGHT: location */}
        <div className="lg:col-span-3 space-y-2">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
            <span aria-hidden>📍</span> Field location
          </h3>
          <p className="text-xs text-slate-400">
            Pick how you want to set the field&apos;s coordinates. Weather, soil and price tools all key off this point.
          </p>
          <div className="pt-1">
            <LocationPicker
              value={{ lat: form.latitude, lon: form.longitude }}
              onChange={p => { set("latitude", p.lat); set("longitude", p.lon); }}
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
      <span className="label">{label}{required && <span className="text-red-400"> *</span>}</span>
      {children}
    </label>
  );
}
