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

