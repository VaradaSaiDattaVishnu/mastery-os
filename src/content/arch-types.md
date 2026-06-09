TypeScript's type system is not Java's — it is structurally typed and inference-first, which means the compiler reasons about the shape of values, not their nominal lineage. Generics and narrowing let you model reality precisely enough that entire classes of runtime bugs become compile-time errors.

## The core

**Structural typing.** Two types are compatible if their shapes are compatible — no explicit `implements` required. This is intentional: it reflects how JavaScript actually works (duck typing). The implication: you can satisfy an interface with any object that has the right fields, which makes adapter patterns and fakes trivially easy to write.

**Generics.** A generic type is a function over types. `Array<T>` says "a list of some type T — tell me what T is and I'll tell you the type of `.map()`'s callback". The power is in constraints (`T extends StoragePort`) and conditional types (`T extends Promise<infer U> ? U : never`).

**Narrowing.** TypeScript tracks what you've ruled out. After `if (typeof x === 'string')`, TypeScript knows `x` is a `string` in that branch. Discriminated unions make this explicit and exhaustive: a `type Result<T> = { ok: true; value: T } | { ok: false; error: string }` forces you to handle both cases — the compiler catches the missing branch.

**Inference.** TypeScript infers return types, callback parameter types, and generic type arguments. Annotating every variable is noise. Annotate boundaries (function parameters, exported types) and let inference handle the interior.

```ts
// Discriminated union — the right shape for Result types
type Result<T, E = string> =
  | { ok: true;  value: T }
  | { ok: false; error: E }

async function fetchUser(id: string): Promise<Result<User>> {
  try {
    const user = await db.users.findById(id)
    if (!user) return { ok: false, error: 'not_found' }
    return { ok: true, value: user }
  } catch (e) {
    return { ok: false, error: 'db_error' }
  }
}

// Caller is forced to handle both cases — no "forgetting" to check
const result = await fetchUser('u-1')
if (!result.ok) {
  console.error(result.error) // TypeScript knows `.error` exists here
  return
}
console.log(result.value.name) // TypeScript knows `.value` exists here

// Generic port with constraint
interface Repository<T extends { id: string }> {
  findById(id: string): Promise<T | null>
  save(entity: T): Promise<void>
}

// Infer the element type of an array — utility type pattern
type ElementOf<T> = T extends ReadonlyArray<infer U> ? U : never
type LessonId = ElementOf<typeof LESSON_IDS> // literal union of all IDs

// Conditional type — strip null/undefined
type NonNullable<T> = T extends null | undefined ? never : T

// Template literal types — validate string shapes at compile time
type EventName = `${string}:${string}`            // "order:created", "user:updated"
type RouteParam = `/api/${string}/${string}`       // "/api/users/u-1"

// satisfies — validate shape without widening the type
const config = {
  provider: 'groq',
  model:    'llama3-70b-8192',
} satisfies Partial<LLMConfig>     // errors if unknown keys, but type stays narrow
```

## In your project

Every TypeScript app (JARVIS, Unity, gharKa, Order, CUBE) benefits from these patterns. JARVIS's provider interface uses generics for the message type. The adapter implementations satisfy `LLMProvider` structurally — no `implements` needed on the class when the shape matches (though being explicit helps documentation). The `Result<T>` type, used in the API layer, means no service function throws — all errors are typed and the caller is forced to handle them.

## Tradeoffs & pitfalls

**`any` is a trapdoor.** `any` disables type checking for that value and propagates: anything that touches `any` becomes `any`. Use `unknown` instead — it forces you to narrow before use. In a codebase where `any` leaks through, the type system is Swiss cheese: structurally sound in most places, silently absent in the places that matter.

**Over-annotating.** Writing explicit types on every local variable is noise that obscures intent. `const x: string = "hello"` is worse than `const x = "hello"`. Annotate public API boundaries, function parameters, and exported types. Trust inference everywhere else.

**Generics that are actually `any` in disguise.** A function typed as `function get<T>(key: string): T` is lying — there's no actual relationship between `key` and `T`. The return type is inferred by the caller, not guaranteed by the implementation. This is worse than `unknown` because it looks safe. Use branded types or discriminated unions to encode the real relationship.

**Enums instead of literal unions.** TypeScript `enum` compiles to a runtime object and can be compared numerically in ways that surprise you. Prefer `const` object + `typeof` or string literal unions: `type Status = 'pending' | 'fulfilled' | 'rejected'`.

## Top-1% insight

**Covariance and contravariance** are the deepest part of the type system and the question that separates intermediate from advanced TypeScript. A `ReadonlyArray<Cat>` is assignable to `ReadonlyArray<Animal>` (covariant — safe because you can't write). A `(animal: Animal) => void` is assignable to `(cat: Cat) => void` (contravariant in parameter position — safe because the function handles all animals, so it can certainly handle a cat). Mutable arrays are *invariant* — `Array<Cat>` is not assignable to `Array<Animal>` because `push(new Dog())` would be valid on the array-as-Animal but wrong for the underlying Cat array. When your generic types behave strangely at assignment boundaries, it's almost always a variance issue. Understanding it makes you the person in the room who can explain why a type error is correct even when it feels wrong.
