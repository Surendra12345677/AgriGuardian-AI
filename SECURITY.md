# Security Policy

## Supported versions
This is an active hackathon project. Only the `main` branch is supported.

| Version | Supported |
| ------- | --------- |
| `main`  | ✅ |
| Older tags | ❌ |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Use one of these private channels:

1. **Preferred** — open a [private security advisory](https://github.com/Surendra12345677/AgriGuardian-AI/security/advisories/new) on this repo.
2. Or start a private discussion with the maintainer.

When reporting, please include:
- A description of the vulnerability and its impact
- Steps to reproduce (PoC if possible)
- Affected files / endpoints
- Suggested mitigation, if any

## Response targets
| Severity | First response | Fix target |
| -------- | -------------- | ---------- |
| Critical (RCE, auth bypass, secret leak) | 24 h | 72 h |
| High (data exposure, privilege escalation) | 48 h | 7 days |
| Medium / Low | 7 days | best-effort |

## Scope
In scope:
- Spring Boot backend (REST endpoints, agent orchestrator)
- Gemini / Arize integration code
- Mongo data handling
- Frontend (Next.js) auth & input handling
- CI / CD workflows

Out of scope:
- Third-party services (Gemini API, Arize, Open-Meteo) — please report to those vendors
- Vulnerabilities requiring physical access to the user's device

## Hall of fame
Researchers who responsibly disclose valid issues will be credited in the release notes (with permission).

## Secret handling & rotation policy

This project never commits real credentials. The repo enforces this via:

- `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`, `*.pem`, `*.key`,
  and `secrets/`.
- `.env.example` ships placeholder values only.
- A **gitleaks** GitHub Actions workflow (`.github/workflows/gitleaks.yml`)
  scans every push and PR for accidentally committed secrets.
- CodeQL scans the Java codebase for hardcoded credentials.

### If a secret is leaked (in chat, screenshot, repo, log, anywhere):

1. **Treat it as compromised immediately.** Assume an attacker has it.
2. **Rotate at the source:**
   - **Gemini API keys** → https://aistudio.google.com/app/apikey →
     delete the leaked key and create a new one.
   - **Arize API keys** → Arize console → *Settings → API Keys* →
     revoke the leaked key and issue a new Service Key (Member role,
     least privilege).
   - **MongoDB / database** → rotate the connection-string password
     and update `MONGODB_URI` in `.env` and any deployment secret store.
3. **Update local `.env`** with the fresh values; never paste them into
   chat, issues, PRs, or commits.
4. If the secret was ever committed, **also purge it from history** with
   `git filter-repo` (or BFG) and force-push, then notify any forks.
5. Open a private security advisory describing scope and remediation.

> The maintainers will not investigate or store any credential pasted into
> a public issue — please rotate first, then report.

