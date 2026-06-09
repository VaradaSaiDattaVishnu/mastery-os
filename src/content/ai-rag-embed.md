An embedding maps text to a point in high-dimensional space where semantic proximity equals geometric proximity — two sentences meaning the same thing land near each other even if they share no words.

## The core

**How embeddings are produced.** A sentence transformer (like MiniLM-L6-v2) encodes text through multiple attention layers and outputs a fixed-length dense vector — 384 dimensions for MiniLM, 1536 for OpenAI's `text-embedding-3-small`. The model is trained with contrastive loss: similar pairs are pushed together, dissimilar pairs apart.

**Cosine similarity.** Dot product of two unit-normalised vectors measures the cosine of the angle between them. It ranges from -1 (opposite) to 1 (identical). Since embedding models output near-unit vectors, cosine sim is essentially a dot product and is the standard distance metric for semantic search.

```
cosine_sim(A, B) = (A · B) / (|A| |B|)
```

**Approximate Nearest Neighbours (ANN).** Exact cosine search over 1M vectors is O(n·d) — impractical. ANN indices (HNSW in Chroma/FAISS, IVF in FAISS) trade a small accuracy loss for sub-linear query time. HNSW builds a layered graph; at query time it greedily traverses from coarse to fine layers to find the k nearest neighbours.

```python
from sentence_transformers import SentenceTransformer
import numpy as np
import chromadb

model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# Embed a corpus
docs = [
    "JARVIS can control smart home devices via voice.",
    "The chanting analysis uses MFCC features.",
    "Isolation Forest detects anomalies without labels.",
]
embeddings = model.encode(docs, normalize_embeddings=True)  # shape: (3, 384)

# Store in Chroma (uses HNSW internally)
client = chromadb.Client()
collection = client.create_collection("jarvis_docs")
collection.add(
    documents=docs,
    embeddings=embeddings.tolist(),
    ids=[f"doc_{i}" for i in range(len(docs))],
)

# Semantic search
query = "How does JARVIS handle home automation?"
q_vec = model.encode([query], normalize_embeddings=True)
results = collection.query(query_embeddings=q_vec.tolist(), n_results=2)
print(results["documents"])  # retrieves the smart home doc at rank 1
```

## In your project

JARVIS's voice RAG uses MiniLM-L6-v2 to embed documentation chunks at ingest time and queries at runtime. MiniLM is the right call here: it's 22MB, runs in <5ms on CPU, and has 384-dim vectors — small enough to store thousands of doc chunks in memory without a dedicated vector DB server.

## Tradeoffs & pitfalls

- **Embedding model mismatch.** The model used to embed the corpus and the model used to embed queries must be identical. Mixing models produces garbage retrieval even if both are "good" models.
- **Cosine similarity does not equal relevance.** Two chunks can be semantically close (same topic) but one is the answer and one is unrelated boilerplate. Retrieval is a recall tool; you still need re-ranking or LLM-based filtering for high-precision use cases.
- **Embedding drift.** If you update your embedding model, all stored vectors are invalid and the entire corpus must be re-embedded. Treat the embedding model version as part of your index schema.
- **Long texts collapse.** Embedding a 10,000-word document into a single 384-dim vector averages out all meaning. The vector ends up near the centroid of many topics, making retrieval inaccurate. This is why chunking is required before embedding.

## Top-1% insight

Normalising embeddings before storage (`normalize_embeddings=True`) converts dot product search to cosine search and, more importantly, makes FAISS's `IndexFlatIP` (inner product) exact cosine search — avoiding the need for a separate normalisation step at query time. But the deeper insight: cosine similarity is rotation-invariant but not translation-invariant. If you fine-tune your embedding model on domain-specific data (medical, legal, Sanskrit chanting), the rotation of the space changes — and re-embedding your corpus is not optional, it's required. In JARVIS, if you ever swap from MiniLM to a fine-tuned model, every stored vector in every Chroma collection is invalidated.
