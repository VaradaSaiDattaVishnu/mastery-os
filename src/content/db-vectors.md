A vector store indexes high-dimensional float arrays so you can answer "what is most similar to this?" in milliseconds — the retrieval engine underneath every RAG system.

## The core

An embedding model (e.g., `all-MiniLM-L6-v2` with 384 dimensions) maps text to a point in ℝ³⁸⁴ such that semantically similar texts are geometrically close. "Similarity" is measured by **cosine similarity**: the cosine of the angle between two vectors, ranging from −1 (opposite) to 1 (identical direction). For normalized vectors, cosine similarity equals dot product — which is why vectors are often L2-normalized before storage.

**Exact nearest-neighbour (brute force)**: compute cosine similarity against every stored vector. O(n·d) where d = dimensions. Correct, but unusable at scale (1M vectors × 384 dims = 384M multiplications per query).

**Approximate Nearest Neighbour (ANN)**: trades a small recall loss for sub-linear query time. The most common algorithms:
- **HNSW (Hierarchical Navigable Small World)**: builds a multi-layer graph where each node is connected to its nearest neighbours. Query traverses from the top (sparse, long-range) layer down to the bottom (dense, short-range) layer. O(log n) query time. Best recall/speed tradeoff; used by pgvector, Qdrant, Weaviate.
- **IVF (Inverted File Index)**: clusters vectors with k-means; query searches only the nearest k clusters. Faster to build than HNSW; lower recall at high compression.
- **LSH (Locality-Sensitive Hashing)**: projects vectors into hash buckets where similar vectors collide with high probability. Simple, but lower recall than HNSW for the same query budget.

```python
# JARVIS: embed and store memory items (sentence-transformers + SQLite)
from sentence_transformers import SentenceTransformer
import numpy as np
import sqlite3, struct

model = SentenceTransformer("all-MiniLM-L6-v2")  # 384-dim, 80 MB, CPU-fast

def embed(text: str) -> bytes:
    vec = model.encode(text, normalize_embeddings=True)  # L2-normalize
    return struct.pack(f"{len(vec)}f", *vec)              # float32 → bytes for BLOB

def store_memory(conn: sqlite3.Connection, content: str, source: str):
    blob = embed(content)
    conn.execute(
        "INSERT INTO memory_items (content, embedding, source) VALUES (?,?,?)",
        (content, blob, source)
    )
    conn.commit()

def cosine_search(conn: sqlite3.Connection, query: str, top_k=5):
    q_vec = model.encode(query, normalize_embeddings=True)

    rows = conn.execute("SELECT id, content, embedding FROM memory_items").fetchall()
    scored = []
    for id_, content, blob in rows:
        vec = np.frombuffer(blob, dtype=np.float32)
        score = float(np.dot(q_vec, vec))   # dot == cosine for normalized vecs
        scored.append((score, content))

    scored.sort(reverse=True)
    return [c for _, c in scored[:top_k]]
```

```python
# Production: pgvector (PostgreSQL extension) with HNSW index
# pip install pgvector psycopg2-binary

import psycopg2
from pgvector.psycopg2 import register_vector

conn = psycopg2.connect(DATABASE_URL)
register_vector(conn)

# Schema
conn.execute("""
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE TABLE memory_items (
    id         BIGSERIAL PRIMARY KEY,
    content    TEXT NOT NULL,
    embedding  vector(384),
    source     TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  -- HNSW index: m=16 (neighbours per node), ef_construction=64 (build quality)
  CREATE INDEX ON memory_items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
""")

# Nearest-neighbour query
def search(query: str, top_k=5):
    q_vec = model.encode(query, normalize_embeddings=True).tolist()
    cur = conn.execute(
        "SELECT content, 1 - (embedding <=> %s) AS score "
        "FROM memory_items ORDER BY embedding <=> %s LIMIT %s",
        (q_vec, q_vec, top_k)
    )
    return cur.fetchall()
# <=> is cosine distance operator in pgvector; subtract from 1 for similarity
```

## In your project

JARVIS uses MiniLM embeddings over its SQLite memory store for RAG: when the user asks a question, the query is embedded, the top-k most similar memory items are retrieved, and they are injected into the LLM context as grounding. The SQLite brute-force approach (cosine in Python) is correct for JARVIS's scale (thousands of items). At millions of items, the pgvector + HNSW approach becomes necessary.

## Tradeoffs & pitfalls

- **Chunking determines retrieval quality more than the index**: if chunks are too large, the retrieved text is noisy; too small, they lose context. 256–512 tokens with 10–20% overlap is a common starting point. The chunk boundary strategy (sentence-aware vs fixed-length) matters more than the ANN algorithm at small scale.
- **Embedding model mismatch**: you must use the same embedding model at ingest time and query time. Switching models requires re-embedding all stored vectors — there is no migration path.
- **HNSW is memory-hungry**: the graph structure stores ~8–16 bytes per connection × m connections per node. For 1M vectors at m=16, the HNSW index alone uses ~1–2 GB RAM. Size your vector store accordingly.
- **Cosine similarity ≠ relevance**: two semantically similar texts may not be the best answer to a question. Hybrid search (BM25 keyword + vector cosine, reranked by a cross-encoder) consistently outperforms pure vector search on factual retrieval benchmarks.

## Top-1% insight

The HNSW `ef_search` parameter (set at query time, not build time) controls the beam width during graph traversal: higher values find better neighbours but take longer. The default (`ef_search = 40` in pgvector) is tuned for general use. For a RAG system where recall matters more than latency (you are already paying LLM latency), set `SET hnsw.ef_search = 100` per session. Benchmark recall@10 (fraction of true top-10 results found) against query latency for your data distribution — the optimal ef_search is dataset-specific and often 2–3x the default.
