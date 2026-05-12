import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgriGuardian AI",
  description:
    "Agentic farm-advisor built on Google Cloud Agent Builder with Gemini 3 and Arize MCP."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-emerald-100/60 bg-white/70 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🌱</span>
              <div>
                <h1 className="font-semibold text-lg leading-tight">AgriGuardian AI</h1>
                <p className="text-xs text-slate-500">
                  Gemini 3 · Agent Builder · Arize MCP
                </p>
              </div>
            </div>
            <nav className="flex gap-4 text-sm">
              <a className="hover:text-leaf-700" href="/swagger-ui.html">API</a>
              <a className="hover:text-leaf-700"
                 href="https://github.com/Surendra12345677/AgriGuardian-AI"
                 target="_blank" rel="noreferrer">GitHub</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 py-6 text-xs text-slate-500">
          Built for the Google Cloud Rapid Agent Hackathon · MIT licensed.
        </footer>
      </body>
    </html>
  );
}

