A RAG pipeline turns an LLM from a guesser into a reader: it retrieves evidence, forces the model to ground its answer in that evidence, and emits citations so the claim is verifiable.

## The core

**The five stages.**
1. **Ingest.** Load documents, chunk them, embed each chunk, store (chunk text, embedding, metadata) in a vector store.
2. **Retrieve.** Embed the query, ANN-search the vector store, optionally re-rank.
3. **Ground.** Insert retrieved chunks verbatim into the prompt under a `[CONTEXT]` block, before the user question.
4. **Generate.** Instruct the model to answer only from the context and to cite source IDs inline.
5. **Parse.** Extract citations from the response and return them alongside the answer for display or audit.

**Hallucination control.** The system prompt must be explicit: "Answer only using information in the CONTEXT block. If the context does not contain enough information, say so. Do not add information from your training." The key failure mode is the model "helpfully" supplementing retrieved context with memorised facts — which may be wrong and will have no citation.

**Citations.** Tag each chunk with a source ID at ingest (filename + page or chunk index). Instruct the model to cite as `[source_id]` inline. Parse these out and resolve them to URLs or document names for display.

```python
import json
from sentence_transformers import SentenceTransformer
import chromadb
from groq import Groq

embed_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
chroma = chromadb.Client()
collection = chroma.get_or_create_collection("jarvis_docs")
llm = Groq()

SYSTEM = """You are JARVIS, a voice assistant. Answer using ONLY the CONTEXT below.
Cite sources inline as [source_id]. If the context is insufficient, say "I don't have that information."
Never add facts not present in the context."""

def retrieve_context(query: str, k: int = 4) -> list[dict]:
    q_vec = embed_model.encode([query], normalize_embeddings=True)
    results = collection.query(query_embeddings=q_vec.tolist(), n_results=k)
    return [
        {"id": id_, "text": doc}
        for id_, doc in zip(results["ids"][0], results["documents"][0])
    ]

def rag_query(user_question: str) -> dict:
    chunks = retrieve_context(user_question)

    # Build grounded context block
    context_block = "\n\n".join(f"[{c['id']}] {c['text']}" for c in chunks)

    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"CONTEXT:\n{context_block}\n\nQUESTION: {user_question}"},
    ]
    resp = llm.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.0,
        max_tokens=512,
    )
    answer = resp.choices[0].message.content

    # Extract cited source IDs from answer text
    import re
    cited_ids = list(set(re.findall(r'\[([^\]]+)\]', answer)))
    sources = {c["id"]: c["text"][:120] for c in chunks if c["id"] in cited_ids}

    return {"answer": answer, "sources": sources}

result = rag_query("How do I ask JARVIS to control the lights?")
print(result["answer"])
print("\nSources:", json.dumps(result["sources"], indent=2))
```

## In your project

JARVIS implements voice RAG over its own tool documentation. When a user asks how to do something JARVIS can do, the system retrieves the relevant tool description chunks and grounds the spoken response with citations — preventing the model from improvising tool syntax it doesn't actually support.

## Tradeoffs & pitfalls

- **Retrieval failure is silent.** If the relevant chunk wasn't ingested or was chunked poorly, the model will say "I don't have that information" even if the answer exists in the corpus. Log retrieval results and measure recall separately from generation quality.
- **Context window overflow.** With top-k=10 chunks of 400 tokens each, you've committed 4,000 tokens to context before the conversation history and answer budget. Size your pipeline with token arithmetic, not guesswork.
- **Stale index.** If the source documents are updated but the vector store isn't re-indexed, the model grounds answers in outdated information. Implement an ingest pipeline triggered on document changes.
- **Citation parsing fragility.** Models sometimes emit `[source_id]` in places that aren't citations (like markdown headers). Use structured output (JSON) with a `citations` field instead of regex parsing when precision matters.

## Top-1% insight

The hardest RAG failure mode is **context contamination**: you retrieve 4 chunks, 3 are relevant and 1 is plausible-but-wrong, and the model synthesises all four into a confident answer that is partly fabricated. The fix is not better retrieval — it's instructing the model to treat each source independently and note conflicts: "If sources disagree, cite both and flag the discrepancy." This transforms the LLM from a synthesiser into a reporter, which is the correct epistemic stance for a grounded AI system.
