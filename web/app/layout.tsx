import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "AgriGuardian AI · Agentic farm advisor",
  description:
    "An agent that plans the season — Google Cloud Agent Builder + Gemini, traced by Arize, persisted in MongoDB.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div id="top" />
        <Navbar />
        <main className="mx-auto max-w-7xl px-5 lg:px-8 py-8">{children}</main>

        <footer className="border-t border-white/5 mt-20 bg-[#04060a]">
          <div className="mx-auto max-w-7xl px-5 lg:px-8 py-10 grid md:grid-cols-4 gap-8 text-sm">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2">
                <span className="grid place-items-center h-8 w-8 rounded-lg
                                 bg-gradient-to-br from-emerald-400 to-emerald-600
                                 text-slate-950 font-black">AG</span>
                <span className="font-semibold text-slate-100">
                  AgriGuardian <span className="text-emerald-400">AI</span>
                </span>
              </div>
              <p className="text-slate-400 mt-3 max-w-md">
                An autonomous Gemini agent that plans the most profitable season for smallholder
                farmers — grounded in live weather, soil, and market signals.
              </p>
            </div>
            <div>
              <div className="label mb-2">Product</div>
              <ul className="space-y-1.5 text-slate-400">
                <li><a className="hover:text-emerald-300" href="#demo">Live agent</a></li>
                <li><a className="hover:text-emerald-300" href="#scenarios">What-if</a></li>
                <li><a className="hover:text-emerald-300" href="#doctor">Plant Doctor</a></li>
              </ul>
            </div>
            <div>
              <div className="label mb-2">Engineering</div>
              <ul className="space-y-1.5 text-slate-400">
                <li><a className="hover:text-emerald-300" href="/swagger-ui.html">REST API</a></li>
                <li><a className="hover:text-emerald-300"
                       href="https://github.com/Surendra12345677/AgriGuardian-AI"
                       target="_blank" rel="noreferrer">GitHub</a></li>
                <li><a className="hover:text-emerald-300" href="#how">Architecture</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5">
            <div className="mx-auto max-w-7xl px-5 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>Built for Google Cloud · Building Agents for Real-World Challenges</span>
              <span>Apache-2.0 · Gemini 2.5 · Arize MCP · MongoDB Atlas</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
