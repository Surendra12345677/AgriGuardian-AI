import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgriGuardian AI · Agentic farm advisor",
  description:
    "An agent that plans the season — Google Cloud Agent Builder + Gemini, traced by Arize, persisted in MongoDB.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-30 border-b border-white/5 bg-[#05070b]/70 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <span className="grid place-items-center h-9 w-9 rounded-xl
                               bg-gradient-to-br from-emerald-400 to-emerald-600
                               text-slate-950 font-black shadow-lg shadow-emerald-500/30">
                AG
              </span>
              <div className="leading-tight">
                <div className="font-semibold text-slate-100">
                  AgriGuardian <span className="text-emerald-400">AI</span>
                </div>
                <div className="text-[11px] text-slate-400">Plan · Reason · Act</div>
              </div>
            </a>

            <nav className="hidden md:flex items-center gap-2">
              <span className="chip">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live agent
              </span>
              <a className="btn-ghost text-sm" href="/swagger-ui.html">API</a>
              <a className="btn-ghost text-sm"
                 href="https://github.com/Surendra12345677/AgriGuardian-AI"
                 target="_blank" rel="noreferrer">GitHub</a>
              <a className="btn-primary text-sm" href="#demo">Try the agent</a>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>

        <footer className="border-t border-white/5 mt-16">
          <div className="mx-auto max-w-7xl px-6 py-6 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <span>Built for Google Cloud · Building Agents for Real-World Challenges</span>
            <span>Apache-2.0 · Gemini 2.5 · Arize MCP · MongoDB Atlas</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
