Prisma is a schema-first ORM that generates a fully-typed query client from a single `schema.prisma` source of truth — migrations, queries, and your TypeScript types all derive from one place, eliminating a whole class of runtime mismatches.

## The core

Prisma has three distinct layers:

1. **Prisma Schema**: the declarative data model. `prisma generate` reads it and emits a TypeScript client with types derived from your models.
2. **Prisma Client**: a query builder that translates method calls into SQL. It does NOT use an internal query cache — every `.findMany()` hits the database. Connection pooling is handled by the underlying driver (or Prisma's Data Proxy / Accelerate for serverless).
3. **Prisma Migrate**: generates and applies SQL migration files. `prisma migrate dev` diffs the current schema against the last migration, generates a new `.sql` file, and applies it. Migrations are stored in `prisma/migrations/` and versioned in git — this is the correct way to track schema evolution.

Under the hood, Prisma Client compiles your method chain into a SQL query, sends it over a connection from the pool (via the `@prisma/client` engine process, which is a Rust binary bundled with the package), and deserializes the result into typed objects. The Rust engine does the connection management and query serialization — this is why `prisma generate` must be run after install.

```ts
// gharKa: property listing with relations and filtering
// schema.prisma (relevant excerpt)
/*
model Property {
  id          String   @id @default(cuid())
  title       String
  priceInr    Int
  city        String
  status      PropertyStatus @default(AVAILABLE)
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id])
  images      Image[]
  inquiries   Inquiry[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([city, status])       // composite index for browse queries
  @@index([ownerId])            // FK index — Prisma does NOT auto-add this
}
*/

// Type-safe query — TypeScript knows the shape at compile time
const listings = await prisma.property.findMany({
  where: {
    city:   { equals: "Hyderabad" },
    status: "AVAILABLE",
    priceInr: { lte: 5_000_000 }
  },
  include: {
    owner:  { select: { name: true, phone: true } },
    images: { take: 1, orderBy: { isPrimary: "desc" } }
  },
  orderBy: { createdAt: "desc" },
  skip: 0,
  take: 20,
})
// listings: Property & { owner: { name: string; phone: string }, images: Image[] }[]
```

```ts
// N+1 TRAP — the #1 Prisma mistake
// This runs 1 query for properties + N queries for each owner
const props = await prisma.property.findMany({ take: 20 })
for (const p of props) {
  p.owner = await prisma.user.findUnique({ where: { id: p.ownerId } })
  // 21 total queries
}

// FIX: use include or select in the initial query
const props = await prisma.property.findMany({
  take: 20,
  include: { owner: true }   // 2 queries: properties + users IN (...)
})

// Prisma's batching: it groups N findUnique calls with the same model
// into a single IN query automatically — but only for findUnique on PK.
// Nested include is always safer and explicit.

// Safe upsert + transaction
const [property, _activity] = await prisma.$transaction([
  prisma.property.upsert({
    where:  { id: input.id ?? "new" },
    update: input,
    create: { ...input, ownerId: session.userId }
  }),
  prisma.activityLog.create({
    data: { action: "PROPERTY_SAVED", userId: session.userId }
  })
])
```

## In your project

gharKa's data layer is Prisma over PostgreSQL. The property browsing query (filter by city + status + price, paginated, with one image and owner phone) is a perfect fit for a composite index on `(city, status)` plus an eager `include`. The ORM's type safety catches the common mistake of accessing `listing.owner.phone` when `owner` was not included in the query — TypeScript errors at compile time, not runtime.

## Tradeoffs & pitfalls

- **N+1 is Prisma's most common bug**: any loop that calls `prisma.*.findUnique` for each item in a list is N+1. Always push the join into `include` or use `prisma.$queryRaw` for complex cases.
- **`include` vs `select`**: `include: { owner: true }` fetches all fields of `owner`. `select: { owner: { select: { name: true } } }` fetches only what you need. For API responses that serialize to JSON, always use `select` to avoid leaking fields (e.g., `passwordHash`).
- **Migrations in CI/CD**: `prisma migrate deploy` (not `dev`) is the command for production. `dev` resets the database if it detects drift — dangerous in production.
- **`@@index` is not automatic for FK fields**: Prisma creates the FK constraint but not the index on the referencing column. You must explicitly add `@@index([ownerId])` in the schema or the FK lookup is a full table scan.

## Top-1% insight

Prisma's `$transaction` has two modes: sequential (array of operations, runs in a single transaction) and interactive (callback with a `tx` client, allows application logic between queries). The interactive mode is essential when you need to read a value, compute something in your application, and write conditionally — all within one transaction. But interactive transactions hold a database connection for their entire duration, so keep them short. For high-throughput paths, prefer the array form (Prisma handles the connection checkout and release) or use optimistic concurrency with a `version` field rather than a long-held transaction.
