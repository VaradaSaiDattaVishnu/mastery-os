import type { Lesson, Module, Track } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// The skill tree — every concept in Vishnu's projects, sequenced to the core.
// ids are stable and used as keys for authored content + progress tracking.
// ─────────────────────────────────────────────────────────────────────────────

export const tracks: Track[] = [
  {
    id: 'frontend',
    title: 'Frontend, to the metal',
    tagline: 'React internals, state architecture, and the performance work that shows up in real metrics.',
    color: '#6EE7F9',
    modules: [
      {
        id: 'fe-react',
        title: 'React, how it actually works',
        summary: 'Past the API — the render model, hooks, and reconciliation that decide your UI’s speed.',
        lessons: [
          { id: 'fe-react-render', title: 'The render & commit model', coreIdea: 'React builds a tree, diffs it, then commits — a “render” is not a paint.', project: 'Portfolio / CUBE', concepts: ['Virtual DOM', 'reconciliation', 'fiber', 'render vs commit'] },
          { id: 'fe-react-hooks', title: 'Hooks, closures & the rules', coreIdea: 'Hooks are positional state; stale closures are the #1 bug source.', project: 'JARVIS / ToDoApp', concepts: ['useState', 'useEffect', 'dependency array', 'stale closure', 'useRef'] },
          { id: 'fe-react-rerender', title: 'Why components re-render (and how to stop)', coreIdea: 'Referential equality drives re-renders; memoization is a scalpel, not a sledgehammer.', project: 'CUBE — 2.5× interaction speed', concepts: ['memo', 'useMemo', 'useCallback', 'context pitfalls'] },
          { id: 'fe-react-keys', title: 'Keys, lists & reconciliation', coreIdea: 'Keys are identity; the wrong key remounts the world.', project: 'scale-quest', concepts: ['keys', 'list diffing', 'remount vs update'] },
        ],
      },
      {
        id: 'fe-state',
        title: 'State architecture',
        summary: 'Where state lives decides how an app scales. Redux Toolkit, Zustand, and caching.',
        lessons: [
          { id: 'fe-state-models', title: 'Local vs global vs server state', coreIdea: 'Most “state management” problems are putting state in the wrong place.', project: 'All apps', concepts: ['state taxonomy', 'colocation', 'server cache'] },
          { id: 'fe-state-redux', title: 'Redux Toolkit, done right', coreIdea: 'Slices + Immer + memoized selectors + normalization = predictable state at scale.', project: 'CUBE / ToDoApp', concepts: ['RTK', 'Immer', 'reselect', 'normalization'] },
          { id: 'fe-state-zustand', title: 'Zustand & the store pattern', coreIdea: 'A tiny store with selector subscriptions avoids context re-render storms.', project: 'JARVIS / Portfolio', concepts: ['zustand', 'selectors', 'transient updates'] },
          { id: 'fe-state-caching', title: 'Client caching & killing refetch', coreIdea: 'Cache identity-stable data once; invalidate deliberately — that’s the −90%.', project: 'CUBE — −90% network', concepts: ['cache-aside', 'invalidation', 'request dedupe'] },
        ],
      },
      {
        id: 'fe-perf',
        title: 'Performance & rendering',
        summary: 'The work behind 3s→800ms and 100k rows at 60fps.',
        lessons: [
          { id: 'fe-perf-virtualization', title: 'Virtualizing 100k rows', coreIdea: 'Only render what’s on screen; the DOM, not your data, is the bottleneck.', project: 'CUBE — virtualized grid', concepts: ['windowing', 'variable row height', 'overscan', 'layout thrash'] },
          { id: 'fe-perf-sw', title: 'Service Workers & instant loads', coreIdea: 'A proxy in the browser that caches assets turns repeat visits near-instant.', project: 'CUBE — 3s→800ms', concepts: ['service worker', 'Cache API', 'lifecycle', 'precaching'] },
          { id: 'fe-perf-loading', title: 'Code-splitting & the critical path', coreIdea: 'Ship less JS sooner; defer the rest. LCP is a budget, not luck.', project: 'Portfolio / Mongo Mastery', concepts: ['code splitting', 'dynamic import', 'bundle analysis', 'LCP'] },
          { id: 'fe-perf-paint', title: 'Reflow, repaint & 60fps', coreIdea: 'Animate transform/opacity; everything else can trigger layout and drop frames.', project: 'Portfolio — spatial canvas', concepts: ['reflow', 'compositing', 'requestAnimationFrame', 'will-change'] },
        ],
      },
      {
        id: 'fe-platform',
        title: 'The web platform',
        summary: 'Events, device APIs, WebGL, and accessibility — the raw material under the framework.',
        lessons: [
          { id: 'fe-plat-events', title: 'Events, pointer & gestures', coreIdea: 'Capture/bubble + pointer events power drag, pinch, and pan correctly.', project: 'Portfolio — pan/zoom', concepts: ['event phases', 'pointer events', 'passive listeners', 'pointer capture'] },
          { id: 'fe-plat-webapis', title: 'Notifications, Speech & storage', coreIdea: 'The browser ships an OS-worth of APIs — voice, reminders, local persistence.', project: 'ToDoApp / JARVIS', concepts: ['Notifications API', 'Web Speech', 'localStorage', 'permissions'] },
          { id: 'fe-plat-webgl', title: 'WebGL & the GPU (Three.js)', coreIdea: 'You hand the GPU vertices + shaders; it draws millions of pixels in parallel.', project: 'Portfolio / gharKa', concepts: ['WebGL', 'GLSL shaders', 'render loop', 'draw calls'] },
          { id: 'fe-plat-a11y', title: 'Accessibility, to the core', coreIdea: 'Semantics first, ARIA second, focus management always.', project: 'Portfolio', concepts: ['semantic HTML', 'ARIA roles', 'focus management', 'keyboard nav'] },
        ],
      },
    ],
  },

  {
    id: 'backend',
    title: 'Backend & APIs',
    tagline: 'The runtime, the contracts, and the real-time + auth machinery behind your services.',
    color: '#A78BFA',
    modules: [
      {
        id: 'be-node',
        title: 'The Node.js runtime',
        summary: 'How non-blocking I/O actually works, and the Express pipeline on top.',
        lessons: [
          { id: 'be-node-loop', title: 'The event loop, truly', coreIdea: 'One thread, many phases; libuv does the blocking so JS never does.', concepts: ['event loop', 'phases', 'microtasks', 'libuv'] },
          { id: 'be-node-async', title: 'Promises, async/await & streams', coreIdea: 'Streams + backpressure let you process more data than fits in memory.', project: 'JARVIS — TTS streaming', concepts: ['promise', 'async/await', 'streams', 'backpressure'] },
          { id: 'be-node-express', title: 'Express & middleware pipelines', coreIdea: 'A request flows through an ordered pipe of middleware; order is everything.', project: 'JARVIS / Unity / Order', concepts: ['middleware', 'routing', 'error handling', 'req lifecycle'] },
        ],
      },
      {
        id: 'be-api',
        title: 'API design',
        summary: 'REST that scales, validation as a contract, resilience, and Python services.',
        lessons: [
          { id: 'be-api-rest', title: 'REST that scales', coreIdea: 'Resources, correct status codes, idempotency, pagination, versioning.', project: 'All services', concepts: ['REST', 'status codes', 'idempotency', 'pagination'] },
          { id: 'be-api-validation', title: 'Validation & contracts', coreIdea: 'Validate at the boundary; never trust input, always shape it.', project: 'Unity — Joi schemas', concepts: ['validation', 'schema', 'DTO', 'boundary'] },
          { id: 'be-api-resilience', title: 'Rate limiting & resilience', coreIdea: 'Token buckets, timeouts, retries with backoff, and circuit breakers keep you up.', project: 'API gateway', concepts: ['rate limiting', 'retry/backoff', 'timeout', 'circuit breaker'] },
          { id: 'be-api-fastapi', title: 'FastAPI & Python services', coreIdea: 'Async Python + pydantic gives typed, fast services — ideal for serving ML.', project: 'Order — ml-service', concepts: ['FastAPI', 'pydantic', 'uvicorn', 'async Python'] },
        ],
      },
      {
        id: 'be-realtime',
        title: 'Real-time & auth',
        summary: 'WebSockets, tokens, passwordless OTP, and authorization done properly.',
        lessons: [
          { id: 'be-rt-ws', title: 'WebSockets & real-time', coreIdea: 'A persistent duplex connection; the hard part is scaling rooms and presence.', project: 'JARVIS / Unity / Issue platform', concepts: ['WebSocket handshake', 'rooms', 'presence', 'scaling sockets'] },
          { id: 'be-rt-authjwt', title: 'JWT, sessions & OAuth2', coreIdea: 'Stateless tokens vs server sessions — and why refresh tokens exist.', project: 'Gateway / gharKa', concepts: ['JWT', 'sessions', 'OAuth2', 'refresh tokens'] },
          { id: 'be-rt-otp', title: 'Phone OTP & passwordless', coreIdea: 'Short-lived codes + rate limiting + verification beat passwords for many apps.', project: 'gharKa — phone OTP', concepts: ['OTP', 'expiry', 'rate limiting', 'verification flow'] },
          { id: 'be-rt-rbac', title: 'RBAC & authorization', coreIdea: 'Authentication is who you are; authorization is what you may do.', project: 'Unity — RBAC across 15 modules', concepts: ['RBAC', 'roles', 'permissions', 'policy enforcement'] },
        ],
      },
    ],
  },

  {
    id: 'databases',
    title: 'Databases & Data',
    tagline: 'MongoDB to its B-trees, Redis patterns, embedded SQLite, ORMs, and vector search.',
    color: '#34D399',
    modules: [
      {
        id: 'db-mongo',
        title: 'MongoDB, to the core',
        summary: 'Modeling, the query language, aggregation, indexing internals, and transactions.',
        lessons: [
          { id: 'db-mongo-model', title: 'Document modeling & schema design', coreIdea: 'Model for access patterns: embed what you read together, reference what you don’t.', project: 'Unity — 38 models', concepts: ['document model', 'embed vs reference', 'access patterns'] },
          { id: 'db-mongo-query', title: 'Query language & operators', coreIdea: 'find + operators + projection; the shape of the query decides the index used.', project: 'Mongo Mastery', concepts: ['find', 'operators', 'projection', 'query shape'] },
          { id: 'db-mongo-agg', title: 'The aggregation pipeline', coreIdea: 'Data flows stage-to-stage; think in transformations, not loops.', project: 'Mongo Mastery — pipeline visualizer', concepts: ['aggregation', '$group', '$lookup', '$match early'] },
          { id: 'db-mongo-index', title: 'Indexes & B-trees', coreIdea: 'An index is a sorted B-tree; covered queries never touch the document.', project: 'Mongo Mastery — index visualizer', concepts: ['B-tree', 'compound index', 'covered query', 'explain()'] },
          { id: 'db-mongo-tx', title: 'Transactions & consistency', coreIdea: 'Multi-document transactions exist — use write concern to choose durability.', project: 'Order Processing', concepts: ['transactions', 'write concern', 'read concern'] },
        ],
      },
      {
        id: 'db-cache',
        title: 'Caching & key-value',
        summary: 'Redis structures and patterns, plus when embedded SQLite is the right call.',
        lessons: [
          { id: 'db-redis', title: 'Redis: structures & patterns', coreIdea: 'It’s not just a cache — strings, hashes, sets, sorted sets, streams in memory.', project: 'Order / Gateway', concepts: ['Redis', 'data structures', 'TTL', 'eviction'] },
          { id: 'db-redis-patterns', title: 'Caching patterns & pub/sub', coreIdea: 'Cache-aside vs write-through, plus pub/sub and distributed locks.', project: 'Order Processing', concepts: ['cache-aside', 'write-through', 'pub/sub', 'distributed lock'] },
          { id: 'db-sqlite', title: 'SQLite & embedded data', coreIdea: 'A whole SQL database in a file — perfect for local-first and edge.', project: 'JARVIS — memory store', concepts: ['SQLite', 'WAL mode', 'embedded', 'local-first'] },
        ],
      },
      {
        id: 'db-relational',
        title: 'Relational, ORMs & vectors',
        summary: 'SQL fundamentals, type-safe Prisma, and similarity search for AI.',
        lessons: [
          { id: 'db-sql', title: 'SQL & relational modeling', coreIdea: 'Normalize to remove anomalies; ACID guarantees keep money safe.', concepts: ['SQL', 'normalization', 'ACID', 'joins'] },
          { id: 'db-prisma', title: 'Prisma & type-safe data', coreIdea: 'Schema-first ORM with migrations — and the N+1 trap to avoid.', project: 'gharKa', concepts: ['Prisma', 'migrations', 'N+1 query', 'type safety'] },
          { id: 'db-vectors', title: 'Vector stores & similarity', coreIdea: 'Store embeddings, search by cosine distance with approximate nearest neighbours.', project: 'JARVIS — RAG', concepts: ['vector store', 'ANN', 'cosine similarity', 'index'] },
        ],
      },
    ],
  },

  {
    id: 'systemdesign',
    title: 'System Design & Distributed Systems',
    tagline: 'From one server to global scale — and the saga that runs your order pipeline.',
    color: '#60A5FA',
    modules: [
      {
        id: 'sd-scale',
        title: 'Scaling fundamentals',
        summary: 'Load balancing, caching layers, sharding, and the consistency tradeoffs.',
        lessons: [
          { id: 'sd-scale-lb', title: 'Load balancing', coreIdea: 'Spread traffic across replicas; L4 vs L7, health checks, sticky sessions.', project: 'scale-quest', concepts: ['load balancer', 'L4 vs L7', 'health checks', 'algorithms'] },
          { id: 'sd-scale-cache', title: 'Caching layers', coreIdea: 'Cache as close to the user as correctness allows; measure hit ratio.', project: 'scale-quest / CUBE', concepts: ['CDN', 'app cache', 'invalidation', 'hit ratio'] },
          { id: 'sd-scale-shard', title: 'Sharding & replication', coreIdea: 'Partition to scale writes, replicate to scale reads — beware hotspots.', project: 'scale-quest', concepts: ['sharding', 'partition key', 'replication', 'hotspots'] },
          { id: 'sd-scale-cap', title: 'CAP, consistency & tradeoffs', coreIdea: 'Under partition you choose consistency or availability; PACELC adds latency.', concepts: ['CAP', 'PACELC', 'eventual consistency', 'quorum'] },
        ],
      },
      {
        id: 'sd-async',
        title: 'Async & messaging',
        summary: 'Queues, events, the saga pattern, and surviving failure with idempotency.',
        lessons: [
          { id: 'sd-async-queue', title: 'Message queues', coreIdea: 'A queue decouples producers from consumers and absorbs spikes.', project: 'Order — RabbitMQ', concepts: ['queue', 'RabbitMQ', 'exchange', 'ack/nack'] },
          { id: 'sd-async-event', title: 'Event-driven architecture', coreIdea: 'Emit facts (events), not commands; choreography vs orchestration.', project: 'Order Processing', concepts: ['event-driven', 'event vs command', 'choreography'] },
          { id: 'sd-async-saga', title: 'The saga pattern', coreIdea: 'No distributed transaction — a chain of local steps with compensations.', project: 'Order — inventory→payment→notify', concepts: ['saga', 'compensation', 'distributed transaction'] },
          { id: 'sd-async-idem', title: 'Idempotency, DLQ & retries', coreIdea: 'Exactly-once is a myth; design idempotent consumers + dead-letter queues.', project: 'Order — DLQ + retries', concepts: ['idempotency key', 'DLQ', 'retry', 'at-least-once'] },
        ],
      },
      {
        id: 'sd-arch',
        title: 'Architectures & interviews',
        summary: 'Microservices, gateways, observability, and the design-interview framework.',
        lessons: [
          { id: 'sd-arch-micro', title: 'Microservices: when & how', coreIdea: 'Split by bounded context and data ownership — or inherit a distributed monolith.', project: 'Order — 9 services', concepts: ['microservices', 'bounded context', 'data ownership'] },
          { id: 'sd-arch-gateway', title: 'API gateways & BFF', coreIdea: 'One front door for auth, routing, rate-limiting, and aggregation.', project: 'Order — gateway', concepts: ['API gateway', 'BFF', 'aggregation'] },
          { id: 'sd-arch-observability', title: 'Observability', coreIdea: 'Logs, metrics, traces — and SLOs so you know what “healthy” means.', concepts: ['logging', 'metrics', 'distributed tracing', 'SLO'] },
          { id: 'sd-arch-design', title: 'Designing a system in an interview', coreIdea: 'Requirements → estimates → API → data model → scale → tradeoffs.', project: 'scale-quest', concepts: ['capacity estimation', 'API design', 'tradeoff framing'] },
        ],
      },
    ],
  },

  {
    id: 'ops',
    title: 'Deep-Dive: Order Processing System',
    tagline: 'Your 9-service, event-driven, ML-scored order platform — wired end to end, the applied capstone.',
    color: '#F59E0B',
    modules: [
      {
        id: 'ops-arch',
        title: 'Architecture & request lifecycle',
        summary: 'The nine services, why event-driven, and how one order flows through all of them.',
        lessons: [
          { id: 'ops-overview', title: 'The system at a glance', coreIdea: 'Nine focused services behind a gateway, talking over RabbitMQ — deliberately not a monolith.', project: 'Order Processing System', concepts: ['microservices', 'event-driven', 'service boundaries', 'C4 map'] },
          { id: 'ops-lifecycle', title: 'An order’s journey, end to end', coreIdea: 'POST /orders persists, publishes order.created, and a saga reserves stock → pays → notifies.', project: 'Order Processing System', concepts: ['request lifecycle', 'sync vs async boundary', 'order.created'] },
          { id: 'ops-shared', title: 'The shared contract (packages/shared)', coreIdea: 'Shared event types + middleware keep services decoupled without silently drifting apart.', project: 'Order Processing System', concepts: ['event contracts', 'shared package', 'typed events', 'versioning'] },
        ],
      },
      {
        id: 'ops-messaging',
        title: 'Messaging, saga & resilience',
        summary: 'RabbitMQ topology, the inventory→payment→notification saga, and surviving failure.',
        lessons: [
          { id: 'ops-rabbit', title: 'RabbitMQ topology', coreIdea: 'Topic exchanges + routing keys fan events to the right queues; ack and prefetch control flow.', project: 'Order Processing System', concepts: ['topic exchange', 'routing key', 'ack/nack', 'prefetch'] },
          { id: 'ops-saga', title: 'The saga: inventory → payment → notification', coreIdea: 'A chain of local steps with compensations replaces an impossible distributed transaction.', project: 'Order Processing System', concepts: ['saga', 'compensation', 'atomic stock reservation'] },
          { id: 'ops-idem', title: 'Idempotency, DLQ & retries', coreIdea: 'Payment is at-least-once; idempotency keys + a dead-letter queue make retries safe.', project: 'Order Processing System', concepts: ['idempotency key', 'DLQ', 'retry/backoff', 'outbox'] },
        ],
      },
      {
        id: 'ops-ml',
        title: 'The ML anomaly pipeline',
        summary: 'From raw order history to a calibrated, explainable fraud score served by FastAPI.',
        lessons: [
          { id: 'ops-ml-features', title: 'Time-aware per-user features', coreIdea: 'Features computed identically at train and serve time — the only way to avoid train/serve skew.', project: 'Order Processing System', concepts: ['feature engineering', 'train/serve parity', 'leakage'] },
          { id: 'ops-ml-iforest', title: 'Isolation Forest scoring (FastAPI)', coreIdea: 'Unsupervised isolation learns “normal” and flags the unusual — no labels, no magic thresholds.', project: 'Order Processing System', concepts: ['Isolation Forest', 'FastAPI', 'cold-start bootstrap'] },
          { id: 'ops-ml-explain', title: 'Calibration & the “24σ” explanation', coreIdea: 'A calibrated 0–1 score plus feature ablation turns a flag into a reason a human can trust.', project: 'Order Processing System', concepts: ['calibration', 'feature ablation', 'explainability'] },
          { id: 'ops-ml-retrain', title: 'Self-updating models', coreIdea: 'Scheduled retraining + model persistence keep the detector current as real orders accumulate.', project: 'Order Processing System', concepts: ['retraining', 'model persistence', 'drift'] },
        ],
      },
      {
        id: 'ops-run',
        title: 'Running & operating it',
        summary: 'The gateway, data-per-service, Docker Compose, testing, and a senior design review.',
        lessons: [
          { id: 'ops-gateway', title: 'The API gateway', coreIdea: 'One front door owns auth (JWT), RBAC, rate-limiting and routing so every service stays simple.', project: 'Order Processing System', concepts: ['API gateway', 'JWT', 'RBAC', 'rate limit'] },
          { id: 'ops-data', title: 'Data per service: MongoDB + Redis', coreIdea: 'Each service owns its database; Redis handles caching and idempotency — never a shared DB.', project: 'Order Processing System', concepts: ['database per service', 'Redis', 'cache', 'idempotency store'] },
          { id: 'ops-compose', title: 'Docker Compose & the dev loop', coreIdea: 'Compose brings up nine services + infra with health checks so the whole system boots with one command.', project: 'Order Processing System', concepts: ['docker compose', 'healthcheck', 'service dependencies'] },
          { id: 'ops-test', title: 'Testing the system', coreIdea: 'pytest for the ML service, workspace typecheck for TS, and saga tests that prove compensations fire.', project: 'Order Processing System', concepts: ['pytest', 'integration tests', 'CI'] },
          { id: 'ops-design-review', title: 'Design review: surviving 100× scale', coreIdea: 'Where it bends first — and why replacing “ML wearing a costume” was the most important fix.', project: 'Order Processing System', concepts: ['bottlenecks', 'observability', 'evolution', 'tradeoffs'] },
        ],
      },
    ],
  },

  {
    id: 'aiml',
    title: 'AI / ML Engineering',
    tagline: 'LLMs, agents, RAG, and the real ML behind anomaly detection and audio analysis.',
    color: '#F472B6',
    modules: [
      {
        id: 'ai-llm',
        title: 'LLMs & agents',
        summary: 'How models work, prompting that holds, the agentic loop, and streaming.',
        lessons: [
          { id: 'ai-llm-basics', title: 'How LLMs work (tokens, context, sampling)', coreIdea: 'Next-token prediction over a context window; temperature shapes the gamble.', project: 'JARVIS', concepts: ['tokens', 'context window', 'temperature', 'top-p'] },
          { id: 'ai-llm-prompt', title: 'Prompt engineering that holds', coreIdea: 'System role, few-shot, and structure beat clever wording.', project: 'JARVIS', concepts: ['system prompt', 'few-shot', 'structured output', 'guardrails'] },
          { id: 'ai-llm-tools', title: 'Agentic tool-calling loops', coreIdea: 'The model proposes a tool call, you run it, feed the result back — loop until done.', project: 'JARVIS — ~20 tools', concepts: ['function calling', 'agent loop', 'tool schema', 'recovery'] },
          { id: 'ai-llm-stream', title: 'Streaming & provider abstraction', coreIdea: 'Stream tokens for latency; abstract providers so Groq↔Claude is a swap.', project: 'JARVIS — Groq→Claude', concepts: ['token streaming', 'SSE', 'provider abstraction'] },
        ],
      },
      {
        id: 'ai-rag',
        title: 'RAG & embeddings',
        summary: 'Turn documents into searchable meaning and ground answers with citations.',
        lessons: [
          { id: 'ai-rag-embed', title: 'Embeddings & semantic search', coreIdea: 'Text → vector; nearby vectors mean similar meaning.', project: 'JARVIS — MiniLM', concepts: ['embeddings', 'MiniLM', 'cosine', 'semantic search'] },
          { id: 'ai-rag-chunk', title: 'Chunking & retrieval', coreIdea: 'Chunk size + overlap + top-k decide whether retrieval helps or hurts.', project: 'JARVIS', concepts: ['chunking', 'overlap', 'top-k', 're-ranking'] },
          { id: 'ai-rag-pipeline', title: 'A RAG pipeline with citations', coreIdea: 'Ingest → embed → retrieve → ground the prompt → cite sources.', project: 'JARVIS — voice RAG', concepts: ['RAG', 'grounding', 'citations', 'hallucination control'] },
        ],
      },
      {
        id: 'ai-ml',
        title: 'Classic ML & signals',
        summary: 'Features, anomaly detection, calibration/explainability, and audio ML.',
        lessons: [
          { id: 'ai-ml-features', title: 'Features, training & serving skew', coreIdea: 'A model is only its features; compute them identically at train and serve time.', project: 'Order — per-user features', concepts: ['feature engineering', 'train/serve skew', 'leakage'] },
          { id: 'ai-ml-anomaly', title: 'Anomaly detection (Isolation Forest)', coreIdea: 'Unusual points are easy to isolate with random splits — no labels needed.', project: 'Order — fraud scoring', concepts: ['Isolation Forest', 'unsupervised', 'anomaly score'] },
          { id: 'ai-ml-calib', title: 'Calibration & explainability', coreIdea: 'A score must mean something (calibration); a flag must say why (ablation).', project: 'Order — “24σ above normal”', concepts: ['calibration', 'feature ablation', 'explainability', 'SHAP'] },
          { id: 'ai-ml-audio', title: 'Audio ML: FFT, MFCC & attention', coreIdea: 'Sound → spectrum (FFT) → perceptual features (MFCC); attention weighs what matters.', project: 'Unity — chanting analysis', concepts: ['FFT', 'spectrogram', 'MFCC', 'attention'] },
        ],
      },
    ],
  },

  {
    id: 'csfoundations',
    title: 'CS Foundations',
    tagline: 'Complexity, data structures, and algorithms — the bedrock under the O(n²)→O(n) win.',
    color: '#FBBF24',
    modules: [
      {
        id: 'cs-complexity',
        title: 'Complexity & thinking',
        summary: 'Big-O as a design tool, and recursion over trees.',
        lessons: [
          { id: 'cs-bigo', title: 'Big-O & complexity analysis', coreIdea: 'Big-O is how cost grows with n — the lens that turns O(n²) into O(n).', project: 'CUBE — tree filter O(n²)→O(n)', concepts: ['Big-O', 'time/space', 'amortized analysis'] },
          { id: 'cs-recursion', title: 'Recursion & trees', coreIdea: 'Solve a problem in terms of itself; trees are recursion made data.', project: 'CUBE — hierarchical grid', concepts: ['recursion', 'base case', 'tree traversal', 'memoized recursion'] },
        ],
      },
      {
        id: 'cs-ds',
        title: 'Data structures',
        summary: 'The structures that decide whether an operation is O(1) or O(n).',
        lessons: [
          { id: 'cs-ds-arrays', title: 'Arrays, hashing & maps', coreIdea: 'Hashing trades memory for O(1) lookup — the workhorse of fast code.', concepts: ['array', 'hash map', 'set', 'collision'] },
          { id: 'cs-ds-trees', title: 'Trees, heaps & tries', coreIdea: 'Balanced trees give O(log n); heaps give the best/worst fast; tries give prefixes.', concepts: ['BST', 'balance', 'heap', 'trie'] },
          { id: 'cs-ds-graphs', title: 'Graphs & traversal', coreIdea: 'Most real problems are graphs; BFS/DFS are your first tools.', concepts: ['graph', 'BFS', 'DFS', 'shortest path'] },
        ],
      },
      {
        id: 'cs-algo',
        title: 'Algorithms & patterns',
        summary: 'The reusable patterns that crack most coding problems.',
        lessons: [
          { id: 'cs-algo-patterns', title: 'Core patterns', coreIdea: 'Two pointers, sliding window, binary search — pattern-match, don’t reinvent.', concepts: ['two pointers', 'sliding window', 'binary search'] },
          { id: 'cs-algo-dp', title: 'Dynamic programming', coreIdea: 'Overlapping subproblems + optimal substructure → memoize or tabulate.', concepts: ['DP', 'memoization', 'tabulation', 'state design'] },
          { id: 'cs-algo-sort', title: 'Sorting & selection', coreIdea: 'Know the O(n log n) floor, when O(n) sorts apply, and quickselect.', concepts: ['comparison sort', 'quickselect', 'stability', 'counting sort'] },
        ],
      },
    ],
  },

  {
    id: 'architecture',
    title: 'Architecture & Craft',
    tagline: 'Patterns, monorepos, testing, TypeScript, and shipping with Docker + CI/CD.',
    color: '#FB923C',
    modules: [
      {
        id: 'arch-code',
        title: 'Code & design',
        summary: 'Patterns that matter, clean boundaries, and monorepo architecture.',
        lessons: [
          { id: 'arch-patterns', title: 'Design patterns that matter', coreIdea: 'Strategy, adapter, observer, factory — names for shapes you already build.', project: 'JARVIS — provider adapters', concepts: ['strategy', 'adapter', 'observer', 'SOLID'] },
          { id: 'arch-clean', title: 'Clean boundaries & modularity', coreIdea: 'Dependencies should point inward; a shared core stays platform-agnostic.', project: 'Unity / gharKa — packages/core', concepts: ['modularity', 'dependency inversion', 'boundaries'] },
          { id: 'arch-monorepo', title: 'Monorepos: Turborepo & pnpm', coreIdea: 'One repo, many packages, a cached task graph — share code without chaos.', project: 'Unity / gharKa', concepts: ['monorepo', 'Turborepo', 'pnpm workspaces', 'task graph'] },
        ],
      },
      {
        id: 'arch-quality',
        title: 'Quality',
        summary: 'Testing, TypeScript to the core, and profiling before optimizing.',
        lessons: [
          { id: 'arch-testing', title: 'Testing, to the core', coreIdea: 'Test behaviour, not implementation; the pyramid keeps suites fast.', project: 'Order Processing', concepts: ['testing pyramid', 'unit', 'integration', 'mocking'] },
          { id: 'arch-types', title: 'TypeScript, to the core', coreIdea: 'Structural typing + generics + narrowing model reality at compile time.', project: 'All TS apps', concepts: ['structural typing', 'generics', 'narrowing', 'inference'] },
          { id: 'arch-profiling', title: 'Performance budgets & profiling', coreIdea: 'Measure first; a flamegraph beats a guess every time.', project: 'CUBE', concepts: ['profiling', 'flamegraph', 'budgets', 'benchmark'] },
        ],
      },
      {
        id: 'arch-ops',
        title: 'Ship it',
        summary: 'Containers, CI/CD pipelines, and Git internals.',
        lessons: [
          { id: 'arch-docker', title: 'Docker & containers', coreIdea: 'A container is an isolated process with a packaged filesystem — layers cache builds.', project: 'JARVIS / Order — Docker', concepts: ['container', 'image layers', 'Dockerfile', 'compose'] },
          { id: 'arch-cicd', title: 'CI/CD & GitHub Actions', coreIdea: 'Automate build→test→deploy; every push is a release candidate.', project: 'All — GitHub Pages', concepts: ['CI/CD', 'GitHub Actions', 'artifacts', 'environments'] },
          { id: 'arch-git', title: 'Git internals & workflow', coreIdea: 'Commits are a DAG of snapshots; branches are just pointers.', concepts: ['git DAG', 'rebase vs merge', 'branching', 'reflog'] },
        ],
      },
    ],
  },

  {
    id: 'product',
    title: 'Product & UX Craft',
    tagline: 'The judgment that separates a feature from a product people trust.',
    color: '#5EEAD4',
    modules: [
      {
        id: 'prod-ux',
        title: 'Designing experience',
        summary: 'Ethics, motion, design systems, and perceived performance.',
        lessons: [
          { id: 'prod-ethical', title: 'Ethical & trauma-informed UX', coreIdea: 'Sometimes the right design slows the user down — no streaks, no dark patterns.', project: 'tapasya', concepts: ['ethical design', 'anti-gamification', 'pacing', 'consent'] },
          { id: 'prod-motion', title: 'Motion & micro-interactions', coreIdea: 'Motion is communication: it shows cause, continuity, and state — never decoration.', project: 'Portfolio', concepts: ['easing', 'choreography', 'feedback', 'reduced motion'] },
          { id: 'prod-design-systems', title: 'Design systems & tokens', coreIdea: 'Tokens + components + docs = consistency that scales across a team.', project: 'CUBE — MUI library, 150+ stories', concepts: ['design tokens', 'component library', 'Storybook'] },
          { id: 'prod-perf-ux', title: 'Perceived performance', coreIdea: 'Speed is a feeling: skeletons and optimistic UI beat raw milliseconds.', project: 'CUBE / ToDoApp', concepts: ['skeletons', 'optimistic UI', 'latency perception'] },
        ],
      },
    ],
  },
]

// ── derived lookups ───────────────────────────────────────────────────────────
export const allLessons: Lesson[] = tracks.flatMap((t) => t.modules.flatMap((m) => m.lessons))

export const lessonById = (id: string): Lesson | undefined => allLessons.find((l) => l.id === id)

export function locate(id: string): { track: Track; module: Module; lesson: Lesson } | undefined {
  for (const track of tracks) {
    for (const module of track.modules) {
      const lesson = module.lessons.find((l) => l.id === id)
      if (lesson) return { track, module, lesson }
    }
  }
  return undefined
}

export const trackById = (id: string): Track | undefined => tracks.find((t) => t.id === id)

export const TOTAL_LESSONS = allLessons.length
