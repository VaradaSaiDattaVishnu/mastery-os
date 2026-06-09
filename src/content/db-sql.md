Normalization eliminates update anomalies by ensuring every fact is stored once; ACID guarantees that concurrent mutations leave the database in a consistent state — together they make relational databases the correct default for financial and transactional data.

## The core

**Normalization forms** are rules that eliminate redundancy:
- 1NF: atomic columns (no arrays, no comma-separated lists in a cell)
- 2NF: every non-key column depends on the whole primary key (eliminate partial dependencies)
- 3NF: no transitive dependencies (if A→B→C, store A→B and B→C separately)
- BCNF: every determinant is a candidate key

In practice, design to 3NF, then selectively denormalize for read performance with full awareness of the update anomaly you are accepting.

**ACID** at the storage level:
- **Atomicity**: a transaction's writes are all-or-nothing (undo log / WAL rollback)
- **Consistency**: constraints (FK, UNIQUE, CHECK) are enforced at commit
- **Isolation**: concurrent transactions see a consistent snapshot (MVCC in PostgreSQL/MySQL)
- **Durability**: committed writes survive a crash (WAL flushed to disk)

**Query execution**: the planner receives SQL, rewrites it (predicate pushdown, join reordering), generates candidate plans using cost estimates from column statistics, and picks the cheapest. `EXPLAIN ANALYZE` shows the actual plan with real row counts and timings.

```sql
-- Normalized schema: users, orders, order_items (3NF)
CREATE TABLE users (
  id         BIGSERIAL PRIMARY KEY,
  email      VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_cents INT         NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Index the FK — without this, DELETE from users does a full scan of orders
CREATE INDEX idx_orders_user_id    ON orders(user_id);
CREATE INDEX idx_orders_status_crt ON orders(status, created_at DESC);

CREATE TABLE order_items (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  BIGINT      NOT NULL,
  qty         INT         NOT NULL CHECK(qty > 0),
  unit_cents  INT         NOT NULL
);
CREATE INDEX idx_items_order ON order_items(order_id);

-- JOIN: user's last 10 orders with item count
SELECT
  o.id, o.status, o.total_cents, o.created_at,
  COUNT(i.id) AS item_count
FROM orders o
JOIN order_items i ON i.order_id = o.id
WHERE o.user_id = $1
GROUP BY o.id
ORDER BY o.created_at DESC
LIMIT 10;
```

```sql
-- Window function: running total of revenue per day (no GROUP BY needed)
SELECT
  DATE_TRUNC('day', created_at)                              AS day,
  SUM(total_cents)                                           AS daily_revenue,
  SUM(SUM(total_cents)) OVER (ORDER BY DATE_TRUNC('day', created_at)) AS running_total
FROM orders
WHERE status = 'completed'
GROUP BY 1
ORDER BY 1;

-- CTE for readability (and the planner can inline or materialize)
WITH active_users AS (
  SELECT user_id FROM orders
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY user_id HAVING COUNT(*) >= 3
)
SELECT u.email, u.created_at
FROM users u
JOIN active_users au ON au.user_id = u.id;
```

## In your project

There is no explicitly relational project in the databases track, but the relational knowledge directly applies: PostgreSQL underpins most production deployments of the projects described. The ACID join patterns above map precisely to the payment + order atomicity requirement in Order Processing, and the normalization principles inform schema design for Prisma in gharKa.

## Tradeoffs & pitfalls

- **Missing FK indexes**: PostgreSQL does NOT automatically create an index on the referencing column. A `DELETE FROM users WHERE id = $1` will do a sequential scan of every table that references `users.id` unless you create the index manually.
- **N+1 in SQL**: selecting 100 orders then looping to `SELECT * FROM order_items WHERE order_id = $1` makes 101 queries. Use a `JOIN` or `IN (...)` clause.
- **Over-normalization**: storing `country_code` (a short, rarely-changed string) in a separate `countries` table just to satisfy 3NF adds a join to every user query for no practical benefit. Normalize data that changes; denormalize stable reference data.
- **`SELECT *` in production**: columns added later can break application code that assumed a fixed column order (e.g., positional binding in some drivers). Always enumerate columns.

## Top-1% insight

PostgreSQL's MVCC implementation means `UPDATE` does not modify a row in place — it writes a new row version (tuple) and marks the old one dead. Dead tuples accumulate until `VACUUM` reclaims them. A table that receives many updates (e.g., an `orders.status` column) will bloat significantly without autovacuum tuning. Set `autovacuum_vacuum_scale_factor = 0.01` (1%) for high-churn tables rather than the default 20% — this triggers vacuum more aggressively and prevents table bloat from becoming a performance problem at scale.
