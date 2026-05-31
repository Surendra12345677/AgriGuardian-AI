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
  // Arize-style LLM-as-judge eval — filled async after the main response.
  // These fields ARE serialised by the Spring controller even though the UI
  // may show them a few seconds after the recommendation is first returned.
  evalScore?: number | null;
  evalDetails?: {
    relevance?: number;
    groundedness?: number;
    agronomicCorrectness?: number;
    hallucinationRisk?: number;
    aggregate?: number;
    judge?: string;
  } | null;
  evalJudge?: string | null;
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

async function http<T>(path: string, init?: RequestInit, timeoutMs = 20_000): Promise<T> {
  // Long-running endpoints (LLM calls) need a longer timeout.
  const isLongPoll = path.includes("/recommendations") || path.includes("/diagnose") || path.includes("/replay") || path.includes("/scenarios");
  const ms = isLongPoll ? 120_000 : timeoutMs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${ms / 1000}s. Check that the backend is running.`);
    }
    throw new Error("Cannot reach the backend — is Spring Boot running on port 8080?");
  }
  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.text();
    let detail = body || path;
    try {
      const j = JSON.parse(body);
      if (j && typeof j.error === "string")  detail = j.error;
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
  /** DELETE — remove a farm and all its cached recommendations. */
  deleteFarm: (id: string) =>
    http<void>(`/api/v1/farms/${id}`, { method: "DELETE" }),
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

  // ── Agent Feedback Loop — failed traces → regression tests ──────
  feedbackFailures: (threshold = 0.6, limit = 20) =>
    http<FeedbackFailures>(`/api/v1/feedback/failures?threshold=${threshold}&limit=${limit}`),
  feedbackAnnotate: (id: string, body: { failureMode?: string; expectedBehavior?: string }) =>
    http<FeedbackFailure>(`/api/v1/feedback/${id}/annotate`, {
      method: "POST", body: JSON.stringify(body),
    }),
  feedbackReplay: (id: string) =>
    http<FeedbackReplay>(`/api/v1/feedback/${id}/replay`, { method: "POST" }),
};

/* ── Agent Feedback Loop types ──────────────────────────────────── */
export type FeedbackFailure = {
  id: string;
  farmId: string;
  traceId?: string;
  evalScore: number | null;
  evalJudge?: string;
  failureMode?: string | null;
  expectedBehavior?: string | null;
  replayOfId?: string | null;
  requestSnapshot?: Record<string, unknown> | null;
  createdAt: string;
};

export type FeedbackFailures = {
  threshold: number;
  count: number;
  failureModeTaxonomy: string[];
  failures: FeedbackFailure[];
};

export type FeedbackReplay = {
  originalId: string;
  originalScore: number | null;
  replayId: string;
  replayScore: number | null;
  delta: number | null;
  improved: boolean;
  failureMode?: string | null;
  expectedBehavior?: string | null;
};
