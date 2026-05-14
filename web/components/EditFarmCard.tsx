"use client";

import { useEffect, useState } from "react";
import { api, type Farm } from "@/lib/api";
import LocationPicker from "./LocationPicker";

const WATER = ["LOW", "MEDIUM", "HIGH"] as const;
const SOIL = ["LOAM", "CLAY", "SANDY", "BLACK", "RED"] as const;

/**
 * Edit-in-place card for an existing Farm. Mirrors FarmForm's two-card
 * layout (profile + location map) but PUTs the changes via api.updateFarm
 * and bubbles the saved record up via `onUpdated`.
 */
export default function EditFarmCard({
  farm,
  onUpdated,
  onSwitchToNew,
}: {
  farm: Farm;
  onUpdated: (f: Farm) => void;
  onSwitchToNew?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOk] = useState<string | null>(null);

  const [form, setForm] = useState({
    farmerName: farm.farmerName,
    contact: farm.contact ?? "",
    latitude: farm.latitude,
    longitude: farm.longitude,
    landSizeAcres: farm.landSizeAcres,
    waterAvailability: farm.waterAvailability,
    soilType: farm.soilType,
    budgetInr: farm.budgetInr,
  });

  // When the parent switches selected farm, reset the form to that farm's data.
  useEffect(() => {
    setForm({
      farmerName: farm.farmerName,
      contact: farm.contact ?? "",
      latitude: farm.latitude,
      longitude: farm.longitude,
      landSizeAcres: farm.landSizeAcres,
      waterAvailability: farm.waterAvailability,
      soilType: farm.soilType,
      budgetInr: farm.budgetInr,
    });
    setError(null);
    setOk(null);
  }, [farm.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.farmerName.trim()) {
      setError("Farmer name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const updated = await api.updateFarm(farm.id, form);
      onUpdated(updated);
      setOk(`Saved changes to “${updated.farmerName}”.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* ── CARD 1 · Editable profile ─────────────────────────────────── */}
      <div className="card p-5 lg:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80 font-semibold">
              Editing
            </div>
            <h3 className="font-semibold text-slate-100 text-lg flex items-center gap-2 mt-1">
              <span aria-hidden>✏️</span> {farm.farmerName}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 max-w-md">
              Update the field profile or relocate the pin. Changes are saved to MongoDB
              and immediately picked up by the planner and what-if scenarios.
            </p>
          </div>
          {onSwitchToNew && (
            <button
              type="button"
              onClick={onSwitchToNew}
              className="btn-ghost text-xs"
              title="Add a new farm instead"
            >
              ➕ Add new instead
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Farmer name" required>
            <input
              className="input"
              value={form.farmerName}
              onChange={e => set("farmerName", e.target.value)}
            />
          </Field>
          <Field label="Contact (optional)">
            <input
              className="input"
              value={form.contact}
              placeholder="+91-…"
              onChange={e => set("contact", e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Land (acres)">
            <input
              className="input"
              type="number"
              step="0.1"
              min="0.1"
              value={form.landSizeAcres}
              onChange={e => set("landSizeAcres", Number(e.target.value))}
            />
          </Field>
          <Field label="Budget (INR)">
            <input
              className="input"
              type="number"
              step="500"
              min="0"
              value={form.budgetInr}
              onChange={e => set("budgetInr", Number(e.target.value))}
            />
          </Field>
          <Field label="Water availability">
            <select
              className="input"
              value={form.waterAvailability}
              onChange={e => set("waterAvailability", e.target.value)}
            >
              {WATER.map(w => <option key={w}>{w}</option>)}
            </select>
          </Field>
          <Field label="Soil type">
            <select
              className="input"
              value={form.soilType}
              onChange={e => set("soilType", e.target.value)}
            >
              {SOIL.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* ── CARD 2 · Location ─────────────────────────────────────────── */}
      <div className="card p-5 lg:p-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80 font-semibold">
              Location
            </div>
            <h3 className="font-semibold text-slate-100 text-lg flex items-center gap-2 mt-1">
              <span aria-hidden>📍</span> Field location
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 max-w-md">
              Drag the pin or click on the map to relocate this farm. Weather, soil
              and price tools all key off these coordinates.
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

      {/* ── Submit row ───────────────────────────────────────────────── */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="text-xs text-slate-400">
          Saving updates this farm record in place. Existing recommendations stay linked.
        </div>
        <div className="ml-auto flex items-center gap-3">
          {error && <p className="text-sm text-red-300">{error}</p>}
          {okMsg && <p className="text-sm text-emerald-300">{okMsg}</p>}
          <button disabled={busy} className="btn-primary">
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 block">
      <span className="label">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </span>
      {children}
    </label>
  );
}

