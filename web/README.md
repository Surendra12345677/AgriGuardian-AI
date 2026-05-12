# 🌱 AgriGuardian Web (Next.js 15)

Minimal demo frontend for the AgriGuardian AI agent.

- **Next.js 15** App Router · **React 19** · **TypeScript** · **Tailwind CSS**
- Talks to the Spring Boot backend via a path-rewrite (`/api/*` → `BACKEND_URL`)
  so the browser never has to deal with CORS.
- Three panels: **Onboard farm** · **Your farms** · **Ask the agent** (renders
  the structured recommendation JSON nicely).

## Quick start

```powershell
# from repo root
cd web
Copy-Item .env.local.example .env.local   # adjust BACKEND_URL if needed
npm install
npm run dev
# open http://localhost:3000
```

> The Spring Boot backend must be running on `localhost:8080`
> (or set `BACKEND_URL` to wherever it lives). Stub mode is fine — no API keys
> needed for the demo.

## Build for production

```powershell
npm run build
npm start
```

## File layout

```
web/
├── app/
│   ├── globals.css
│   ├── layout.tsx           # site shell (header / footer)
│   └── page.tsx             # the dashboard
├── components/
│   ├── FarmForm.tsx         # POST /api/v1/farms
│   ├── FarmList.tsx
│   └── AgentPanel.tsx       # POST /api/v1/recommendations
├── lib/api.ts               # typed fetcher
├── next.config.mjs          # backend rewrite rule lives here
├── tailwind.config.ts
└── package.json
```

