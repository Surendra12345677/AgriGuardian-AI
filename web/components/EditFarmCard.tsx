"use client";

/**
 * Compact "edit the selected farm" card.
 *
 * The full FarmForm is great for first-time onboarding, but once a farm
 * exists in the right-hand list it's confusing for beginners — they see
 * eight fields when really they just want to nudge the map pin to the
 * correct village. This card surfaces only what's relevant for that:
 *   • the active farmer's name (read-only chip)
 *   • the live coordinates
 *   • the LocationPicker map
 *   • a "Save new location" button that PUTs to /api/v1/farms/{id}
 *
 * Everything else (soil, water, budget, land size) is preserved as-is by
 * sending the rest of the existing Farm object back to the server.
 */

import { useEffect, useState } from "react";
import { api, type Farm } from "@/lib/api";
import LocationPicker from "./LocationPicker";

export default function EditFarmCard({
  farm, onUpdated, onSwitchToNew,
}: {
  farm: Farm;
  onUpdated: (f: Farm) => void;
  onSwitchToNew: () => void;
}) {
  const [lat, setLat] = useState(farm.latitude);
  const [lon, setLon] = useState(farm.longitude);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [ok,  setOk]    = useState<string | null>(null);

  // When the user picks a different farm in the sidebar, reset the local
  // pin to that farm's actual saved coordinates.
  useEffect(() => {
    setLat(farm.latitude);
    setLon(farm.longitude);
    setErr(null);
    setOk(null);
  }, [farm.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = Math.abs(lat - farm.latitude) > 1e-5 || Math.abs(lon - farm.longitude) > 1e-5;

  async function save() {
    setBusy(true); setErr(null); setOk(null);
    try {
      // Normalize coordinates so a pin dragged past the antimeridian
      // (lon > 180 or < -180) doesn't fail Bean validation on the server.
      const safeLat = Math.max(-90, Math.min(90, lat));
      const wrappedLon = ((lon + 180) % 360 + 360) % 360 - 180;
      const updated = await api.updateFarm(farm.id, {
        farmerName: farm.farmerName,
        contact: farm.contact,
        latitude: safeLat,
        longitude: wrappedLon,
        landSizeAcres: farm.landSizeAcres,
        waterAvailability: farm.waterAvailability,
        soilType: farm.soilType,
        budgetInr: farm.budgetInr,
      });
      onUpdated(updated);
      setLat(updated.latitude);
      setLon(updated.longitude);
      setOk("Location saved. The next plan will use the new coordinates.");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Compact header card showing exactly which farm is being edited. */}
      <div className="card p-5 lg:p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="grid place-items-center h-12 w-12 rounded-xl bg-emerald-400/10 border border-emerald-400/30 text-emerald-300 text-xl shrink-0">
            👤
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80 font-semibold">
              Editing selected farm
            </div>
            <h3 className="font-semibold text-slate-100 text-lg mt-1 truncate">
              {farm.farmerName}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {farm.landSizeAcres} ac · {farm.soilType} soil · water {farm.waterAvailability}
              {farm.budgetInr ? <> · ₹{farm.budgetInr.toLocaleString("en-IN")} budget</> : null}
            </p>
          </div>
          <button onClick={onSwitchToNew}
                  className="btn-ghost text-sm whitespace-nowrap !py-2 !px-3.5">
            ➕ Add a different farm
          </button>
        </div>
      </div>

      {/* Location-only editor — the only thing most demos actually need to change. */}
      <div className="card p-5 lg:p-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80 font-semibold">
              Move the pin
            </div>
            <h4 className="font-semibold text-slate-100 text-base mt-1 flex items-center gap-2">
              <span aria-hidden>📍</span> Update field location
            </h4>
            <p className="text-xs text-slate-400 mt-0.5 max-w-md">
              Search a village or drag the pin to the exact field. Weather,
              soil and price tools all key off these coordinates — moving them
              changes the recommendation.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">New point</div>
            <div className="font-mono text-xs text-slate-200">
              {lat.toFixed(4)}, {lon.toFixed(4)}
            </div>
            {dirty && (
              <div className="text-[10px] text-amber-300 mt-1">
                Unsaved · was {farm.latitude.toFixed(4)}, {farm.longitude.toFixed(4)}
              </div>
            )}
          </div>
        </div>
        <LocationPicker
          value={{ lat, lon }}
          onChange={p => { setLat(p.lat); setLon(p.lon); }}
        />
      </div>

      <div className="card p-4 lg:p-5 flex items-center gap-3 flex-wrap">
        <div className="text-sm text-slate-300">
          {dirty
            ? "You moved the pin — save to update this farm in the database."
            : "Pin matches the saved location. Drag it to enable saving."}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {err && <p className="text-sm text-red-300">{err}</p>}
          {ok  && <p className="text-sm text-emerald-300">{ok}</p>}
          <button disabled={busy || !dirty} onClick={save}
                  className="btn-primary text-base !py-2.5 !px-5 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? "Saving…" : "💾 Save new location"}
          </button>
        </div>
      </div>
    </div>
  );
}

