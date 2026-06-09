CI/CD is not a deployment script — it is the enforcement layer for your quality contract. Every push is a release candidate; the pipeline decides whether it reaches users. Getting this machinery right means you ship with confidence instead of ceremony.

## The core

**The pipeline model.** A CI/CD pipeline is a DAG of jobs. A job is a set of steps running on a runner (GitHub-hosted or self-hosted). Jobs can run in parallel or declare dependencies on each other with `needs:`. The pipeline exits non-zero if any step exits non-zero — the deploy never runs if tests fail.

**GitHub Actions primitives.**
- `workflow`: a YAML file in `.github/workflows/`; triggered by events (`push`, `pull_request`, `workflow_dispatch`, `schedule`)
- `job`: runs on a runner, isolated from other jobs
- `step`: a shell command or a pre-built `uses: actions/...` action
- `artifact`: a file output from one job consumed by another (e.g., a build artifact uploaded by `build`, downloaded by `deploy`)
- `environment`: a named deployment target with protection rules (required reviewers, wait timers)
- `secrets` / `vars`: encrypted values injected as env vars; never echo them to logs

**GitHub Pages deployment.** For static sites, `peaceiris/actions-gh-pages` (or the native `actions/deploy-pages`) pushes the built `dist/` directory to the `gh-pages` branch, which GitHub serves as a static site. The key: build on `ubuntu-latest`, not your local machine — it catches env-specific assumptions.

**Caching.** `actions/cache` restores `node_modules` or Turborepo's cache between runs. The cache key is a hash of `package-lock.json` (or `pnpm-lock.yaml`) + OS + Node version. A cache hit skips `npm ci`, turning a 90-second install into a 3-second restore.

```yaml
# .github/workflows/ci.yml — All apps: build, test, deploy to GitHub Pages
name: CI / CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # ── Job 1: quality gates ──────────────────────────────────────────────────
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with: { version: 9 }

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'           # builtin pnpm cache via actions/setup-node

      - run: pnpm install --frozen-lockfile

      - run: pnpm run lint
      - run: pnpm run typecheck   # tsc --noEmit — catch type errors before build
      - run: pnpm run test --ci   # jest --ci disables watch mode, outputs JUnit XML

      - uses: actions/upload-artifact@v4
        if: always()              # upload coverage even on failure
        with:
          name: coverage
          path: coverage/

  # ── Job 2: build (depends on quality) ────────────────────────────────────
  build:
    needs: quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile

      # Turborepo remote cache — hits are free builds
      - run: pnpm turbo run build
        env:
          TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
          TURBO_TEAM:  ${{ vars.TURBO_TEAM }}

      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: apps/web/dist/

  # ── Job 3: deploy (only on main, depends on build) ────────────────────────
  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production         # requires approval if configured
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/download-artifact@v4
        with: { name: dist, path: dist/ }

      - uses: actions/deploy-pages@v4
        with: { artifact_name: dist }
```

```yaml
# Dependency update automation — keep deps fresh without manual PRs
# .github/workflows/dependabot.yml (Dependabot config, not a workflow)
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      dev-deps:
        patterns: ['@types/*', 'eslint*', 'jest*']
```

## In your project

All your apps deploy to GitHub Pages via this exact pattern. The quality gate (lint + typecheck + test) runs in parallel with nothing — it's the first gate. Build depends on quality. Deploy depends on build and only runs on `main`. A PR can pass quality and build but will never deploy until merged — this is the correctness property CI/CD buys you. Turborepo's remote cache means if `packages/core` hasn't changed, its build step is a cache hit even on a fresh CI runner.

## Tradeoffs & pitfalls

**Secrets in logs.** `echo $SECRET` in a step leaks the secret even though GitHub masks known secrets — the mask is best-effort. Never echo secrets. Pass them as environment variables to the command that needs them.

**Skipping `--frozen-lockfile`.** Using `pnpm install` (without `--frozen-lockfile`) on CI means CI can silently update `pnpm-lock.yaml` to a newer version that wasn't reviewed. `--frozen-lockfile` makes CI fail loudly if the lockfile is out of date — this is the right behaviour.

**`if: always()` overuse.** Marking a step `if: always()` means it runs even if previous steps fail. Use it only for cleanup and artifact upload — never for deployment steps.

**Branch protection without required status checks.** Enabling CI but not requiring it to pass before merging a PR means the CI is optional. Enforce it: in repository settings, require the `quality` and `build` jobs as required status checks on the `main` branch.

## Top-1% insight

The professional distinction is **idempotent deployments**. A naive deploy step runs `git push` or `rsync` and hopes for the best. A production deploy step is idempotent: running it twice produces the same end state as running it once. For static hosting this is trivially true (upload overwrites). For Docker-based services, idempotency comes from using image digests (`image: myapp@sha256:...`) rather than mutable tags (`image: myapp:latest`), so a re-run of the deploy step deploys exactly the same artifact it deployed the first time — no surprises from a tag being updated between steps. Interviewers ask: "how do you ensure a failed deploy can be safely retried?" — idempotency is the answer.
