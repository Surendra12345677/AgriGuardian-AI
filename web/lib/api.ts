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

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store"
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText} — ${body || path}`);
  }
  return (await res.json()) as T;
}

export const api = {
  listFarms:  () => http<Farm[]>("/api/v1/farms"),
  createFarm: (f: Omit<Farm, "id" | "createdAt" | "chosenCrop">) =>
    http<Farm>("/api/v1/farms", { method: "POST", body: JSON.stringify(f) }),
  recommend:  (req: {
    farmId: string; latitude: number; longitude: number; preferredCrop?: string;
  }) =>
    http<Recommendation>("/api/v1/recommendations", {
      method: "POST", body: JSON.stringify(req)
    })
};

