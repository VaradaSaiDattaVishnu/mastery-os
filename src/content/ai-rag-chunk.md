Chunking is the highest-leverage parameter in a RAG system — get it wrong and retrieval fails regardless of how good your embedding model or LLM is.

## The core

**Why chunking?** Embedding a full document loses specificity: the vector averages over all topics. A 512-token chunk of a section on "smart home control" will retrieve far more accurately than a 10,000-token document vector that also covers timers, weather, and calendar features.

**Chunk size.** Smaller chunks (128–256 tokens) give precise retrieval but may lack context. Larger chunks (512–1024 tokens) preserve local context but dilute the embedding signal. The right size depends on document structure: dense technical prose → smaller; narrative → larger.

**Overlap.** A sliding window with 10–20% overlap ensures sentences that span chunk boundaries are represented in both adjacent chunks. Without overlap, a key sentence at a chunk boundary might be retrievable only when that exact chunk is retrieved, not its neighbour.

**Top-k and re-ranking.** Retrieve more candidates than you'll use (top-k = 10–20) then re-rank with a cross-encoder. A bi-encoder (your MiniLM) is fast but scores query and document independently. A cross-encoder attends across both simultaneously — slower but dramatically more precise for the final top-3.

```python
from sentence_transformers import SentenceTransformer, CrossEncoder
import chromadb

bi_encoder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
cross_encoder = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

def chunk_text(text: str, chunk_size: int = 400, overlap: int = 80) -> list[str]:
    """Token-aware fixed-size chunking with overlap."""
    words = text.split()
    chunks = []
    step = chunk_size - overlap
    for i in range(0, len(words), step):
        chunk = " ".join(words[i : i + chunk_size])
        if chunk:
            chunks.append(chunk)
    return chunks

def retrieve(collection, query: str, top_k: int = 10, final_k: int = 3) -> list[str]:
    q_vec = bi_encoder.encode([query], normalize_embeddings=True)

    # Coarse retrieval with bi-encoder
    results = collection.query(query_embeddings=q_vec.tolist(), n_results=top_k)
    candidates = results["documents"][0]  # list of chunk strings

    # Fine re-ranking with cross-encoder
    pairs = [[query, c] for c in candidates]
    scores = cross_encoder.predict(pairs)
    ranked = sorted(zip(scores, candidates), reverse=True)
    return [doc for _, doc in ranked[:final_k]]

# Ingest
client = chromadb.Client()
col = client.create_collection("jarvis_docs")
raw = open("jarvis_manual.txt").read()
chunks = chunk_text(raw, chunk_size=400, overlap=80)
vecs = bi_encoder.encode(chunks, normalize_embeddings=True)
col.add(documents=chunks, embeddings=vecs.tolist(), ids=[f"c{i}" for i in range(len(chunks))])

# Query
top_chunks = retrieve(col, "How do I set a reminder with JARVIS?")
for c in top_chunks:
    print(c[:120], "\n---")
```

## In your project

JARVIS's voice RAG chunks user documentation and tool descriptions. For voice, the retrieved chunks must fit in the remaining context window after the conversation history — which means chunk size is bounded by `(model_context_limit - conversation_tokens - answer_budget) / top_k`. At runtime this calculation is not optional; it's the constraint that sizes chunks at ingest time.

## Tradeoffs & pitfalls

- **Semantic chunking vs fixed-size.** Chunking at sentence or paragraph boundaries is more natural but produces variable-length chunks — harder to budget context tokens predictably.
- **Chunk boundary mid-sentence.** Fixed-size chunking on word count can break sentences. Chunk on sentence endings or use a tokenizer to split at token boundaries, not word boundaries.
- **Re-ranking latency.** A cross-encoder adds 20–100ms per query. For voice applications this is acceptable; for sub-100ms APIs it may not be.
- **Metadata filtering.** Without filtering (e.g., by document type, date, user), retrieval surface is the entire corpus. Always store metadata alongside chunks and filter before embedding search to reduce noise and latency.

## Top-1% insight

The "parent-child" chunking strategy solves the precision/context tradeoff elegantly: embed small child chunks (128 tokens) for precise retrieval, but return the parent chunk (512 tokens) containing them as context to the LLM. The vector search finds the exact sentence; the model gets enough surrounding context to answer correctly. This architecture is superior to simply increasing chunk size because it optimises for two different objectives simultaneously: retrieval precision and generation context quality.
