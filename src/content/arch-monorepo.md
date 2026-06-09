A monorepo is one git repository holding multiple packages whose dependencies are declared explicitly — not via copy-paste — and whose build/test/lint tasks form a directed acyclic graph that Turborepo can schedule, parallelize, and cache.

## The core

**pnpm workspaces** provide the package manager layer. `pnpm-workspace.yaml` declares which directories are packages; pnpm symlinks them into `node_modules` via its content-addressable store rather than duplicating files. The result: one `node_modules` at the root housing a virtual store, plus package-local `node_modules` only for packages that override a version.

**Turborepo task graph** is the orchestration layer. You declare tasks in `turbo.json` — their inputs, outputs, and dependencies between tasks. Turborepo builds a DAG: if `apps/web#build` depends on `packages/core#build`, Turborepo runs core first, then web. It parallelises independent nodes. Crucially, it hashes inputs (source files, env vars, package.json) and caches outputs: a task whose inputs haven't changed is a cache hit — the output is restored instantly without re-running.

**Remote cache** (Vercel or self-hosted) shares that cache across CI machines and developer laptops. A build that took 3 minutes on your colleague's machine is a cache hit on yours if inputs match.

```jsonc
// turbo.json
{
  "$schema": "https://turborepo.org/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],  // ^ means: run this task in all upstream dependencies first
      "inputs": ["src/**", "tsconfig.json", "package.json"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tests/**"],
      "outputs": [],             // tests produce no artifacts to cache
      "cache": true
    },
    "lint": {
      "inputs": ["src/**", ".eslintrc*"],
      "outputs": []
    },
    "dev": {
      "cache": false,            // never cache dev servers
      "persistent": true
    }
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```jsonc
// packages/core/package.json — the shared kernel
{
  "name": "@myapp/core",
  "version": "0.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc --project tsconfig.build.json",
    "test":  "jest"
  },
  "dependencies": {},            // ZERO third-party runtime deps — keeps core portable
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

```jsonc
// apps/mobile/package.json — consumer of core
{
  "name": "@myapp/mobile",
  "dependencies": {
    "@myapp/core": "workspace:*"  // pnpm workspace protocol — local link, not npm
  }
}
```

## In your project

Unity and gharKa are structured this way. Running `turbo run build` from the root builds `packages/core` first (because `apps/` depend on it), then all apps in parallel. Changing only `apps/mobile/src` means `packages/core#build` is a cache hit — Turborepo skips it. On CI, the remote cache means the first push after a cold start warms the cache for every subsequent PR, collapsing build times from minutes to seconds on cache hits.

## Tradeoffs & pitfalls

**Cache poisoning.** If your `inputs` glob misses a file that affects the build (a `.env` file, a generated file, a shared config), Turborepo will incorrectly serve a stale cache hit. Be exhaustive with your `inputs` declaration — err on the side of too broad until you've measured.

**`workspace:*` vs pinned versions.** `workspace:*` always uses the local version, which is correct for development but requires your publish step to resolve it. If you ever publish packages to npm, you need a changeset/versioning tool (changesets, nx release) — otherwise `workspace:*` leaks into the published manifest.

**`devDependencies` hoisting confusion.** pnpm does not hoist by default. A package that uses TypeScript must declare it in its own `devDependencies`, even if the root already has it. This is the right behaviour — explicit is better than implicit — but it surprises developers coming from Yarn/npm workspaces.

**Phantom dependencies.** Because pnpm's virtual store doesn't hoist, a package that accidentally imports a module it didn't declare will fail at runtime. This is a feature: it catches phantom dependencies that worked by accident in npm/Yarn.

## Top-1% insight

The real value of Turborepo is not speed — it is **build correctness encoded as a graph**. When you declare `"dependsOn": ["^build"]`, you are asserting that no consumer can run before its dependencies are built. This turns an implicit temporal assumption ("you must build core before web, don't forget") into an enforced invariant. Interviewers who understand monorepos at depth ask: "how do you ensure correct build ordering?" The answer is `^` in `dependsOn`, not a wiki page.
