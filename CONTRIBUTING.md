# Contributing to AgriGuardian AI

First off — thanks for considering a contribution! 🌱
This project was born during the *Building Agents for Real-World Challenges* hackathon and we welcome ideas, bug reports, and PRs from anyone.

## Code of Conduct
This project adheres to the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## How to contribute

### 🐛 Found a bug?
Open a [bug report](https://github.com/Surendra12345677/AgriGuardian-AI/issues/new?template=bug_report.yml). Please include reproduction steps, expected vs. actual behavior, and your environment.

### ✨ Have a feature idea?
Open a [feature request](https://github.com/Surendra12345677/AgriGuardian-AI/issues/new?template=feature_request.yml) — or, even better, start a [Discussion](https://github.com/Surendra12345677/AgriGuardian-AI/discussions) so we can shape it together.

### 🛠️ Want to send a PR?
1. **Fork** the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. **Code** following the existing style. Run `./gradlew build` locally — it must stay green.
3. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/) — examples:
   - `feat(agent): add seasonal-rotation tool`
   - `fix(api): handle missing soilType gracefully`
   - `docs: clarify Arize setup`
4. **Open a PR** against `main` using the PR template. Link the issue it closes.
5. CI must pass (build + CodeQL). A maintainer will review.

## Development setup
- JDK **17** (Temurin recommended)
- MongoDB on `localhost:27017` (or `docker compose up -d mongo` once compose is added)
- Optional: `GEMINI_API_KEY`, `ARIZE_API_KEY` — without them the app uses deterministic stubs so you can still develop

## Project conventions
- **Conventional Commits** are enforced by review.
- **No secrets** in the repo — use environment variables.
- **No `:latest`** Docker tags.
- **Tests** for any non-trivial logic.
- **Small PRs** (< 400 lines diff) get reviewed faster.

## License
By contributing you agree your work will be released under the [MIT License](./LICENSE).

