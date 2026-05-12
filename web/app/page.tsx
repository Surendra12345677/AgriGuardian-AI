"use client";

import { useEffect, useState } from "react";
import { api, type Farm } from "@/lib/api";
import FarmForm from "@/components/FarmForm";
import FarmList from "@/components/FarmList";
import AgentPanel from "@/components/AgentPanel";

export default function HomePage() {
  const [farms, setFarms]     = useState<Farm[]>([]);
  const [selected, setSelect] = useState<Farm | undefined>();
  const [loading, setLoading] = useState(true);
  const [bootError, setBoot]  = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const list = await api.listFarms();
      setFarms(list);
      if (!selected && list.length) setSelect(list[0]);
    } catch (err: any) {
      setBoot(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700
                          text-white p-6 shadow-lg">
        <h1 className="text-2xl md:text-3xl font-bold leading-tight">
          An agent that plans the season — and learns from its own past runs.
        </h1>
        <p className="mt-2 text-emerald-50 max-w-3xl text-sm md:text-base">
          AgriGuardian uses Gemini 3 on Google Cloud Agent Builder, retrieves
          similar past evaluations through the <strong>Arize MCP</strong> server, then
          persists the plan to MongoDB — under your approval.
        </p>
      </section>

      {bootError && (() => {
        const msg = bootError.toLowerCase();
        const isDbDown =
          msg.includes("500") || msg.includes("mongo") ||
          msg.includes("timeout") || msg.includes("connection refused");
        return isDbDown ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm
                          text-amber-800">
            <strong>MongoDB is not connected yet.</strong> The agent and tool endpoints
            still work — only farm persistence is disabled. Start MongoDB with{" "}
            <code>docker compose up -d mongo</code> or set{" "}
            <code>SPRING_DATA_MONGODB_URI</code> to a MongoDB Atlas cluster, then refresh.
          </div>
        ) : (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm
                          text-red-700">
            Could not reach the backend ({bootError}). Make sure the Spring Boot app is
            running on <code>localhost:8080</code> (or set <code>BACKEND_URL</code>).
          </div>
        );
      })()}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <FarmForm onCreated={f => { setFarms(prev => [f, ...prev]); setSelect(f); }} />

          <div className="bg-white/80 rounded-xl shadow-sm border border-emerald-100 p-5">
            <h2 className="font-semibold text-emerald-800 text-lg mb-2">Your farms</h2>
            <FarmList farms={farms} selectedId={selected?.id}
                      onSelect={setSelect} loading={loading} />
          </div>
        </div>

        <div className="md:col-span-2">
          <AgentPanel farm={selected} />
        </div>
      </div>
    </div>
  );
}

