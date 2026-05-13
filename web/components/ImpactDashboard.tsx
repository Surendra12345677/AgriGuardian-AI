"use client";

export type Impact = {
  expectedRevenueInr?: number;
  extraIncomeInr?: number;
  yieldDeltaPct?: number;
  waterSavingsPct?: number;
  costInr?: number;
  paybackWeeks?: number;
};

export default function ImpactDashboard({ impact }: { impact?: Impact }) {
  if (!impact) return null;
  const fmt = (n?: number) =>
    n == null ? "—" : n >= 1000
      ? "₹" + (n / 1000).toFixed(n >= 100000 ? 1 : 1) + "k"
      : "₹" + n;

  const cards = [
    { k: "Extra income",  v: fmt(impact.extraIncomeInr),
      sub: "vs. doing nothing", color: "from-emerald-400 to-lime-400" },
    { k: "Yield Δ",       v: (impact.yieldDeltaPct ?? 0) + "%",
      sub: "projected gain",     color: "from-emerald-300 to-teal-400" },
    { k: "Water saved",   v: (impact.waterSavingsPct ?? 0) + "%",
      sub: "vs. baseline",       color: "from-sky-300 to-cyan-400" },
    { k: "Payback",       v: (impact.paybackWeeks ?? 0) + " wk",
      sub: "to recover cost",    color: "from-amber-300 to-orange-400" },
  ];

  return (
    <div>
      <div className="label mb-2">Projected impact</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cards.map(c => (
          <div key={c.k} className="card p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">{c.k}</div>
            <div className={`text-xl font-extrabold bg-gradient-to-r ${c.color} bg-clip-text text-transparent`}>
              {c.v}
            </div>
            <div className="text-[10px] text-slate-500">{c.sub}</div>
          </div>
        ))}
      </div>
      {impact.expectedRevenueInr != null && (
        <div className="mt-2 text-[11px] text-slate-500">
          Expected season revenue: <span className="text-slate-300 font-semibold">{fmt(impact.expectedRevenueInr)}</span>
          {" · "}invest <span className="text-slate-300">{fmt(impact.costInr)}</span>
        </div>
      )}
    </div>
  );
}

