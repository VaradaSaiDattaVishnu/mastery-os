A module boundary is only real if the dependency rule is enforced: nothing in the core can import from the platform layer, but the platform layer can import from the core. When that rule holds, you can swap React Native for a web renderer without touching business logic.

## The core

**Dependency direction** is the architectural load-bearing concept. In Clean Architecture terms: entities → use-cases → interface adapters → frameworks/drivers. Each ring can import inward; none can import outward. In a monorepo this maps directly to package boundaries: `packages/core` has zero dependencies on `apps/mobile` or `apps/web`.

**Why it matters for platform-agnostic code.** `packages/core` in your Unity/gharKa monorepo contains storage, auth, and navigation adapters that are *interface definitions*, not implementations. The React Native app provides an `AsyncStorageAdapter implements StoragePort`; the web app provides a `LocalStorageAdapter implements StoragePort`. Core logic (e.g., "save onboarding state") is written once and tested once.

**The anti-corruption layer (ACL).** When you integrate a third-party library, wrap it. Don't scatter `AsyncStorage.setItem` calls across your feature modules. The ACL translates between the third-party's model and your domain model, so the library can be upgraded or replaced without a shotgun search-and-replace.

```ts
// packages/core/src/ports/storage.ts — only types, zero runtime imports
export interface StoragePort {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

// packages/core/src/use-cases/onboarding.ts — depends only on the port
import type { StoragePort } from '../ports/storage'

export class OnboardingService {
  constructor(private readonly storage: StoragePort) {}

  async markComplete(userId: string): Promise<void> {
    await this.storage.set(`onboarding:${userId}`, { completedAt: new Date().toISOString() })
  }

  async isComplete(userId: string): Promise<boolean> {
    const record = await this.storage.get<{ completedAt: string }>(`onboarding:${userId}`)
    return record !== null
  }
}

// apps/mobile/src/adapters/async-storage.ts — RN layer, imports the port
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { StoragePort } from '@myapp/core'

export class AsyncStorageAdapter implements StoragePort {
  async get<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  }
  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value))
  }
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key)
  }
}

// apps/web/src/adapters/local-storage.ts — web layer
import type { StoragePort } from '@myapp/core'

export class LocalStorageAdapter implements StoragePort {
  async get<T>(key: string): Promise<T | null> {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  }
  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value))
  }
  async remove(key: string): Promise<void> {
    localStorage.removeItem(key)
  }
}
```

## In your project

Unity and gharKa are Turborepo monorepos where `packages/core` is the shared kernel. The storage, auth, and navigation ports live there. Neither the React Native shell nor the Next.js web shell bleeds into core. This means `OnboardingService` is unit-tested with a trivial in-memory stub — no device, no emulator, no browser needed.

## Tradeoffs & pitfalls

**Over-abstraction for a single platform.** If you will never have a second platform, the port/adapter split is indirection without payoff. The cost is real: more files, more types, more wiring. Apply it when you already have two platforms or a genuine plan for one.

**"Core" that grows into a second app.** Teams let convenience win and start importing UI components into core, or importing `core` packages from each other to avoid duplication. The rule: `packages/core` has no peer dependencies in `peerDependencies` or `dependencies` that reference other workspace packages. Enforce this in your `eslint` config with `import/no-restricted-paths`.

**Leaky adapters.** The adapter should translate, not expose. If `AsyncStorageAdapter` throws `AsyncStorageError` and your domain catches `AsyncStorageError`, you've imported the external world into your domain anyway — through the exception type.

## Top-1% insight

The true test of a clean boundary is **unit-testability without a runtime**. If you can write a Jest test for `OnboardingService` by passing an in-memory map that satisfies `StoragePort` — no RN, no browser, no env vars — your boundary is real. If you can't, something is leaking. This is also exactly what interviewers mean when they say "design for testability": they're asking whether you've drawn the dependency graph correctly, not whether you've written tests.
