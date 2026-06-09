SQLite is not a "lite" database — it is a full ACID-compliant SQL engine stored in a single file, and WAL mode makes it a legitimate choice for concurrent local-first applications.

## The core

SQLite stores the entire database in one file using a page-based B-tree format. The default page size is 4096 bytes. Every table is a B-tree keyed by `rowid` (or `INTEGER PRIMARY KEY`); secondary indexes are separate B-trees whose leaves hold the indexed value plus the rowid for a lookup back to the main table.

**WAL mode (Write-Ahead Logging)** is the key to understanding SQLite's concurrency model:
- In the default journal mode, writers block all readers. In WAL mode, writers append to a separate `-wal` file; readers continue reading the original database file concurrently.
- Multiple concurrent readers are always allowed in WAL mode. Only one writer at a time is allowed, but readers never block the writer.
- WAL is checkpointed (merged back into the main database file) automatically when it reaches 1000 pages. WAL mode is the correct choice for any application with concurrent reads.

SQLite uses advisory locking at the file level (`SHARED`, `RESERVED`, `PENDING`, `EXCLUSIVE`). On network file systems (NFS, SMB), these locks are unreliable — SQLite is strictly for local storage.

```sql
-- JARVIS memory store: conversation history + semantic lookup
PRAGMA journal_mode = WAL;          -- enable WAL on first open
PRAGMA synchronous = NORMAL;        -- safe with WAL; FULL is ~2x slower
PRAGMA foreign_keys = ON;           -- not default! must enable per-connection
PRAGMA cache_size = -32000;         -- 32 MB page cache (negative = KB)

CREATE TABLE conversations (
  id          INTEGER PRIMARY KEY,  -- rowid alias: O(1) insert + lookup
  session_id  TEXT    NOT NULL,
  role        TEXT    NOT NULL CHECK(role IN ('user','assistant','system')),
  content     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),  -- store as Unix epoch
  token_count INTEGER
);

CREATE INDEX idx_conv_session ON conversations(session_id, created_at DESC);

CREATE TABLE memory_items (
  id          INTEGER PRIMARY KEY,
  content     TEXT    NOT NULL,
  embedding   BLOB,               -- raw float32 array for vector search
  source      TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

```js
// JARVIS: better-sqlite3 (sync API — faster than async in Node.js for SQLite)
import Database from 'better-sqlite3'

const db = new Database('./jarvis.db')
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Prepared statements are compiled once, reused — critical for performance
const insertMsg = db.prepare(
  `INSERT INTO conversations (session_id, role, content, token_count)
   VALUES (@sessionId, @role, @content, @tokenCount)`
)
const getHistory = db.prepare(
  `SELECT role, content FROM conversations
   WHERE session_id = @sessionId
   ORDER BY created_at ASC LIMIT @limit`
)

// Batch insert within a transaction — 100x faster than individual inserts
const insertMany = db.transaction((messages) => {
  for (const m of messages) insertMsg.run(m)
})
insertMany(messageArray)

// Read recent context window
const history = getHistory.all({ sessionId: "sess_abc", limit: 20 })
```

## In your project

JARVIS uses SQLite as its local memory store — every conversation turn, user preference, and extracted fact is written to `jarvis.db`. This is local-first: no network latency, works offline, and is trivially backed up (one file). The `embedding BLOB` column stores the raw `Float32Array` serialized to a Buffer for cosine similarity search in JavaScript, before an external vector index is needed.

## Tradeoffs & pitfalls

- **WAL mode not enabled by default**: every new connection must `PRAGMA journal_mode = WAL`. If you open 10 connections (e.g., in a connection pool) and only set it on one, the others use default journal mode — check with `PRAGMA journal_mode` to confirm.
- **`better-sqlite3` vs `node-sqlite3`**: the synchronous API of `better-sqlite3` is counter-intuitive in Node.js but correct for SQLite — SQLite operations complete in microseconds to milliseconds, and a sync call blocks less real time than the overhead of async I/O wrappers. Use `better-sqlite3` in Node.
- **No ALTER COLUMN**: SQLite has very limited `ALTER TABLE` support. Renaming a column or changing its type requires creating a new table, copying data, dropping the old table, and renaming. Plan migrations carefully; use a migration library (drizzle, better-sqlite3-migrations).
- **Integer affinity gotcha**: columns declared as `TEXT` that receive numeric input will store them as integers due to type affinity. Use `STRICT` table mode (SQLite 3.37+) to enforce declared types.

## Top-1% insight

SQLite's `WITHOUT ROWID` tables store data in a B-tree keyed by the `PRIMARY KEY` rather than a separate rowid. For tables where you always look up by primary key and never by rowid, this eliminates the secondary B-tree lookup and can halve I/O for key-value-style access patterns. JARVIS's `memory_items` table, if looked up exclusively by `id`, would benefit from `WITHOUT ROWID` — but only when `id` is a compact key (integer or short text). With large text primary keys, the B-tree page utilization drops and you lose the benefit.
