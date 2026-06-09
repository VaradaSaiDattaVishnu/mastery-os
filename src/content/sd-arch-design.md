A system design interview is a structured conversation about tradeoffs under constraints — the interviewer is evaluating your ability to drive ambiguity to clarity, size the problem correctly, and explain what you are giving up as clearly as what you are gaining.

## The core

**The six-step framework:**

```
1. Requirements (5 min)
   - Functional: what does the system do?
   - Non-functional: scale, latency, availability, consistency
   - Constraints: known tech, team size, timeline

2. Capacity estimates (3 min)
   - DAU × events/user = write RPS
   - Read:write ratio → read RPS
   - Storage per event × retention = total storage
   - Bandwidth = RPS × payload size

3. API design (5 min)
   - Core endpoints (REST or event schema)
   - Request/response shapes
   - Idempotency requirements

4. Data model (5 min)
   - Entities and relationships
   - Read patterns → index choices
   - Partition key if sharding

5. High-level architecture (10 min)
   - Draw the boxes and arrows (C4 Container level)
   - Name tradeoffs at each boundary

6. Deep-dive + tradeoffs (10 min)
   - Hotspot mitigation
   - Failure modes and recovery
   - Scaling bottleneck and the fix
```

**Worked capacity estimate (Twitter feed):**
```
DAU: 200M users, 10% post per day = 20M posts/day
Write RPS: 20M / 86,400 ≈ 230 writes/s  (burst 10× = 2,300/s)
Read RPS: 200M × 10 reads/day / 86,400 ≈ 23,000 reads/s
Storage: 230 writes/s × 280 bytes × 86,400 s × 365 days ≈ 2.3 TB/year
Media: 5% posts have images, avg 200 KB → 2,300 × 0.05 × 200KB ≈ 23 MB/s → CDN
```

**Tradeoff framing template**: "I am choosing X over Y because at this scale Z matters more than W. The cost is [concrete downside]. I would revisit this if [trigger condition]."

## In your project

scale-quest is a direct simulation of this framework. Each level poses a scaling problem — "your database is saturated at 10k RPS" — and expects you to identify the bottleneck, propose the architectural change (read replica, cache, shard), and acknowledge what gets harder (consistency, operational complexity). The game's scoring is essentially an automated tradeoff rubric.

## Tradeoffs & pitfalls

- **Jumping to solutions**: naming a technology (Kafka, Cassandra) before establishing requirements signals a pattern-matcher, not a designer. Name the constraint first, then the technology that fits.
- **Forgetting failure modes**: every design has a failure mode. An interviewer asking "what happens if the cache is cold?" is checking whether you have thought past the happy path.
- **Over-engineering**: a design with Kafka, Kubernetes, Cassandra, and Redis for a 1,000 DAU product signals poor judgment. Scale the architecture to the requirement, not to what you have read about.
- **Not driving the conversation**: silently drawing boxes loses points. Narrate your reasoning; an interviewer cannot give credit for implicit decisions.

## Top-1% insight

The highest-signal move in a system design interview is to explicitly state what you are not solving. "I'm treating auth as solved — the gateway handles it — so I'll focus on the storage and fan-out problem." This shows that you understand scope, that you can separate concerns, and that you are not padding with complexity. Interviewers at staff-level positions weight this more heavily than whether you correctly named a specific database — because in real work, knowing what to leave out of scope is the harder, rarer skill.
