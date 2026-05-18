/**
 * Tiny typed fetcher. Hits the Spring Boot API via the Next.js rewrite
 * configured in next.config.mjs, so the browser never sees CORS.
 */

export type Farm = {
  id: string;
  farmerName: string;
  contact?: string;
  latitude: number;
  longitude: number;
  landSizeAcres: number;
  waterAvailability: string;
  soilType: string;
  budgetInr: number;
  chosenCrop?: string;
  createdAt: string;
};

export type Recommendation = {
  id: string;
  farmId: string;
  reasoning: string;
  confidenceScore: number;
  traceId?: string;
  createdAt: string;
};

export type Scenario = "BASELINE" | "DROUGHT" | "PRICE_CRASH" | "PEST_OUTBREAK";

export type DiagnoseRequest = {
  crop: string;
  symptoms: string;
  language?: string;
};

export type DiagnoseResponse = { raw: string };

export type EvalTrendPoint = {
  recommendationId: string;
  farmId: string;
  traceId?: string;
  evalScore: number | null;
  judge?: string;
  createdAt: string;
};

export type EvalTrend = {
  count: number;
  averageScore: number | null;
  latestScore: number | null;
  firstScore: number | null;
  deltaScore: number | null;
  series: EvalTrendPoint[];
};

export type EvalDistribution = {
  count: number;
  scored: number;
  averageScore: number | null;
  medianScore: number | null;
  p10: number | null;
  p90: number | null;
  stddev: number | null;
  passRate: number | null;   // fraction with score ≥ 0.75
  failures: number;          // count with score < 0.60
  buckets: { label: string; lo: number; hi: number; count: number }[];
};

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    // Spring returns RFC-7807 application/problem+json — pull out the
    // human-readable `detail` so the UI can show actionable upstream errors
    // (e.g. Gemini quota / billing / model-not-found messages).
    let detail = body || path;
    try {
      const j = JSON.parse(body);
      if (j && typeof j.detail === "string" && j.detail.trim()) detail = j.detail;
      else if (j && typeof j.title === "string") detail = j.title;
    } catch { /* not JSON — keep raw body */ }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const api = {
  listFarms:  () => http<Farm[]>("/api/v1/farms"),
  createFarm: (f: Omit<Farm, "id" | "createdAt" | "chosenCrop">) =>
    http<Farm>("/api/v1/farms", { method: "POST", body: JSON.stringify(f) }),
  /** PUT — used by the "Edit selected farm" card to relocate the pin. */
  updateFarm: (id: string, f: Omit<Farm, "id" | "createdAt" | "chosenCrop">) =>
    http<Farm>(`/api/v1/farms/${id}`, { method: "PUT", body: JSON.stringify(f) }),
  recommend:  (req: {
    farmId: string;
    latitude: number;
    longitude: number;
    preferredCrop?: string;
    language?: string;
    scenario?: Scenario;
    forceLive?: boolean;
  }) =>
    http<Recommendation>("/api/v1/recommendations", {
      method: "POST", body: JSON.stringify(req),
    }),
  clearCache: () =>
    http<{ ok: boolean; droppedEntries: number; message: string }>(
      "/api/v1/admin/cache/clear", { method: "POST" }),
  diagnose: (req: DiagnoseRequest) =>
    http<DiagnoseResponse>("/api/v1/diagnose", {
      method: "POST", body: JSON.stringify(req),
    }),
  evalTrend:       (limit = 20)  => http<EvalTrend>(`/api/v1/eval/quality-trend?limit=${limit}`),
  evalDistribution:(limit = 100) => http<EvalDistribution>(`/api/v1/eval/distribution?limit=${limit}`),
};
