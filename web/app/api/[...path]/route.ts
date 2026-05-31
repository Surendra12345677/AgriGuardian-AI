/**
 * Runtime proxy for /api/* → ${BACKEND_URL}/api/*
 *
 * Why this exists (and not a `rewrites()` entry in next.config.mjs):
 *   Next.js evaluates `async rewrites()` at BUILD time and bakes the
 *   resolved destination string into the routes manifest. That means
 *   `process.env.BACKEND_URL` is read by `next build`, not by the
 *   running server. On Cloud Run the image is built by Cloud Build
 *   without that env var in scope, so the destination ends up baked as
 *   "http://localhost:8080/api/..." and every /api/* call 503s — even
 *   after `gcloud run services update --update-env-vars BACKEND_URL=...`.
 *
 * A Route Handler runs in the Node runtime on every request, so
 * `process.env.BACKEND_URL` is read live and re-deploys / env-var
 * updates take effect immediately without rebuilding the image.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
  // Next/undici set these themselves on the outgoing response.
  "content-encoding", "content-length",
  // Strip Cloud Run / GFE chrome to keep responses clean.
  "alt-svc",
]);

function backendBase(): string | null {
  const raw = process.env.BACKEND_URL?.trim();
  if (!raw) return null;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(raw)) {
    // localhost in a Cloud Run container = self-loop = guaranteed 503.
    if (process.env.NODE_ENV === "production") return null;
  }
  return raw.replace(/\/+$/, "");
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const base = backendBase();
  if (!base) {
    return NextResponse.json(
      {
        error: "BACKEND_URL is not configured on the agriguardian-web service.",
        hint:
          "Set BACKEND_URL=http://localhost:8080 in web/.env.local for local dev, " +
          "or update the Cloud Run service env var for production.",
      },
      { status: 503 },
    );
  }

  const { path } = await ctx.params;
  const search = req.nextUrl.search;
  const target = `${base}/api/${(path ?? []).join("/")}${search}`;

  const fwdHeaders = new Headers();
  req.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk === "host" || HOP_BY_HOP.has(lk)) return;
    fwdHeaders.set(k, v);
  });

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  // Recommendation calls can take up to 90s (Gemini + tools).
  // All other endpoints (farm CRUD, evals) time out at 15s.
  const isLongPoll = target.includes("/recommendations") || target.includes("/diagnose") || target.includes("/replay");
  const timeoutMs  = isLongPoll ? 120_000 : 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers: fwdHeaders,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        error: isAbort
          ? `Backend timed out after ${timeoutMs / 1000}s — check that the backend service is running and reachable.`
          : `Backend unreachable at ${base} — verify BACKEND_URL is correct and the service is running.`,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: isAbort ? 504 : 502 },
    );
  }
  clearTimeout(timer);

  const respHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    if (HOP_BY_HOP.has(k.toLowerCase())) return;
    respHeaders.set(k, v);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

export const GET     = proxy;
export const POST    = proxy;
export const PUT     = proxy;
export const PATCH   = proxy;
export const DELETE  = proxy;
export const HEAD    = proxy;
export const OPTIONS = proxy;

