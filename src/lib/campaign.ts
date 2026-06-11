// ── The Campaign: a 90-day, day-by-day FAANG mission plan ────────────────────
// Built for a frontend-heavy MERN engineer (2 yrs) targeting FAANG → tech lead.
// Encodes learning science as schedule, not advice: daily retrieval warm-ups,
// blocked→interleaved practice (Arena), spacing via consolidation days, and
// deliberate gap-filling (backend/CS depth) where the profile is thinnest.

export interface CampaignTask {
  label: string
  href?: string
}

export interface CampaignDay {
  day: number
  title: string
  tasks: CampaignTask[]
}

export interface CampaignPhase {
  id: string
  title: string
  days: string
  why: string
  color: string
  entries: CampaignDay[]
}

const L = (id: string) => `#/lesson/${id}`
const SQ = 'https://github.com/VaradaSaiDattaVishnu/scale-quest'

const solve = (id: string, what: string): CampaignTask => ({ label: `Solve: ${what}`, href: L(id) })
const read = (id: string, what: string): CampaignTask => ({ label: `Read + dojo: ${what} (one lesson, do its practice)`, href: L(id) })
const warm = (what = 'yesterday’s hardest problem, from a blank editor'): CampaignTask => ({ label: `Warm-up re-solve (10 min): ${what}` })
const arena = (n: number): CampaignTask => ({ label: `Arena: ${n} random timed problems — pattern hidden, 25 min each`, href: '#/arena' })
const review = (): CampaignTask => ({ label: 'Flashcard review queue (10 min)', href: '#/review' })
const quest = (n: number): CampaignTask => ({ label: `scale-quest: clear ${n} level${n > 1 ? 's' : ''}`, href: SQ })
const say = (what: string): CampaignTask => ({ label: `Say aloud (5 min): ${what}` })
const rehearse = (id: string, what: string): CampaignTask => ({ label: `Rehearse aloud: ${what}`, href: L(id) })
const design = (what: string): CampaignTask => ({ label: `Whiteboard 25 min, ALOUD: design ${what} (requirements → API → data → scale)` })
const rest = (): CampaignTask => ({ label: 'Rest. Sleep is when patterns consolidate — this task is not optional.' })

function d(day: number, title: string, ...tasks: CampaignTask[]): CampaignDay {
  return { day, title, tasks }
}

// ── Phase 1 · THE FORGE (Days 1–30): every coding pattern, by hand ──────────
const forge: CampaignDay[] = [
  d(1, 'Open the Gauntlet', { label: 'Read The Protocol (the only pure-reading day you get)', href: L('g-protocol') }, solve('g-hash', 'Hashmap problems 1–2 (Two Sum, Group Anagrams)'), say('the hashmap script: trigger → trade space for O(1) lookups → O(n)/O(n)')),
  d(2, 'Hashing, finished', warm('Two Sum'), solve('g-hash', 'Hashmap problems 3–4 (Top-K, Subarray Sum = K)'), review()),
  d(3, 'Two pointers', warm(), solve('g-twoptr', 'Two-pointer problems 1–2 (Palindrome, Sorted Two Sum)'), read('cs-bigo', 'Big-O — so every script ends with a real complexity line')),
  d(4, 'The 3Sum wall', warm(), solve('g-twoptr', 'Two-pointer problems 3–4 (Container, 3Sum — expect to need the full 25 min)')),
  d(5, 'Sliding window opens', warm('3Sum, from blank'), solve('g-window', 'Window problems 1–2 (Max Sum K, Longest Unique Substring)')),
  d(6, 'ARENA DAY', arena(3), say('for each: which pattern, why, complexity — before reading the reveal')),
  d(7, 'Consolidate', review(), warm('the two problems that needed hints this week'), rest()),
  d(8, 'Window, finished', warm(), solve('g-window', 'Window problems 3–4 (Min Subarray, Character Replacement)')),
  d(9, 'Stacks', warm(), solve('g-stack', 'Stack problems 1–2 (Valid Parens, RPN)'), read('cs-ds-arrays', 'Arrays & memory — what an index really costs')),
  d(10, 'Monotonic + build day', warm(), solve('g-stack', 'Stack problems 3–4 (Daily Temperatures, BUILD MinStack)')),
  d(11, 'Binary search', warm('MinStack, from blank'), solve('g-binsearch', 'Search problems 1–2 (Classic, Lower Bound)')),
  d(12, 'Search the answer', warm(), solve('g-binsearch', 'Search problems 3–4 (Rotated, Koko)')),
  d(13, 'ARENA DAY', arena(3)),
  d(14, 'Consolidate', review(), warm('Koko — narrate the works(k) predicate'), rest()),
  d(15, 'Pointer surgery', warm(), solve('g-list', 'List problems 1–2 (Reverse, Middle)'), read('cs-recursion', 'Recursion — the call stack you’re about to live in')),
  d(16, 'Runners', warm('Reverse List, from blank'), solve('g-list', 'List problems 3–4 (Merge, Cycle)')),
  d(17, 'Trees, recursively', warm(), solve('g-tree-dfs', 'Tree DFS 1–2 (Max Depth, Same Tree)')),
  d(18, 'The BST range trick', warm(), solve('g-tree-dfs', 'Tree DFS 3–4 (Validate BST, LCA)'), read('cs-ds-trees', 'Trees — why h matters more than n')),
  d(19, 'Level by level', warm('Validate BST, from blank'), solve('g-tree-bfs', 'All 3 BFS problems (Level Order, Right View, Min Depth)')),
  d(20, 'ARENA DAY', arena(3)),
  d(21, 'Consolidate', review(), warm('weakest tree problem'), rest()),
  d(22, 'Graphs are grids', warm(), solve('g-graph', 'Graph problems 1–2 (Islands, Rotting Oranges)'), read('cs-ds-graphs', 'Graph representations — adjacency beats matrix, usually')),
  d(23, 'Topo sort + your own heap', warm(), solve('g-graph', 'Graph problem 3 (Course Schedule)'), solve('g-heap', 'Heap problem 1 (BUILD the MinHeap, from memory)')),
  d(24, 'Top-K', warm('MinHeap push/pop, from blank'), solve('g-heap', 'Heap problems 2–3 (Kth Largest, K Closest)')),
  d(25, 'Choose, explore, un-choose', warm(), solve('g-backtrack', 'Backtracking 1–2 (Subsets, Permutations)')),
  d(26, 'Backtracking, finished', warm('Subsets, from blank'), solve('g-backtrack', 'Backtracking 3 (Combination Sum)'), read('cs-algo-dp', 'DP theory primer — before tomorrow’s grind')),
  d(27, 'DP in one dimension', warm(), solve('g-dp1', 'DP problems 1–3 (Stairs, Robber, Coin Change)')),
  d(28, 'LIS + the 2-D table', warm('Coin Change, from blank'), solve('g-dp1', 'DP problem 4 (LIS)'), solve('g-dp2', 'DP-2D problem 1 (Unique Paths)')),
  d(29, 'Two-sequence DP', warm(), solve('g-dp2', 'DP-2D problems 2–3 (LCS, Edit Distance)')),
  d(30, 'PATTERN-COMPLETE', warm('Edit Distance, from blank'), solve('g-intervals', 'All 3 interval problems (Merge, Erase, Jump)'), say('🏁 Milestone: you now own all 14 patterns. From here, mixing > learning.')),
]

// ── Phase 2 · THE ENGINE ROOM (Days 31–50): backend & data depth ────────────
const engine: CampaignDay[] = [
  d(31, 'The event loop, for real', arena(1), read('be-node-loop', 'Node’s event loop — the #1 senior-JS interview question')),
  d(32, 'Async mastery', warm(), read('be-node-async', 'Promises/async internals'), arena(1)),
  d(33, 'APIs that survive review', arena(1), read('be-api-rest', 'REST design — resources, verbs, status codes')),
  d(34, 'Defensive APIs', warm(), read('be-api-validation', 'Validation'), read('be-api-resilience', 'Timeouts, retries, circuit breakers')),
  d(35, 'Auth, the favorite question', arena(1), read('be-rt-authjwt', 'JWT auth — own every step of the flow')),
  d(36, 'ARENA DAY', arena(3)),
  d(37, 'Consolidate + first design rep', review(), quest(2), rest()),
  d(38, 'SQL, because FAANG asks', arena(1), read('db-sql', 'SQL & joins — frontend devs fail this; you won’t')),
  d(39, 'Indexes = interview gold', warm(), read('db-mongo-index', 'How indexes actually work (B-trees)')),
  d(40, 'Aggregation + access control', arena(1), read('db-mongo-agg', 'Aggregation pipelines'), read('be-rt-rbac', 'RBAC — you shipped it in Unity; now defend it')),
  d(41, 'Redis: the cache interview', warm(), read('db-redis', 'Redis fundamentals'), read('db-redis-patterns', 'Cache patterns — aside, through, invalidation')),
  d(42, 'Real-time + vectors', arena(1), read('be-rt-ws', 'WebSockets at scale'), read('db-vectors', 'Vector search — ties to your JARVIS story')),
  d(43, 'ARENA DAY', arena(3)),
  d(44, 'Consolidate', review(), quest(2), rest()),
  d(45, 'Ship like a senior', arena(1), read('arch-docker', 'Docker — images, layers, multi-stage')),
  d(46, 'Types & tests', warm(), read('arch-types', 'Type-level thinking'), read('arch-testing', 'Testing strategy — what to test and why')),
  d(47, 'Idempotency (the senior filter)', arena(1), read('ops-idem', 'Idempotency keys — retries without double-charges')),
  d(48, 'Sagas & queues', warm(), read('ops-saga', 'Saga pattern'), read('ops-rabbit', 'Message queues — your Order system’s spine')),
  d(49, 'Engine-room arena', arena(2), say('the JARVIS + Order architecture, end to end, 3 minutes')),
  d(50, 'ENGINE COMPLETE', review(), quest(2), say('🏁 Milestone: your backend gap is closed. Frontend-heavy is now full-stack-deep.'), rest()),
]

// ── Phase 3 · THE ARCHITECT (Days 51–72): system design + AI edge ───────────
const architect: CampaignDay[] = [
  d(51, 'Design vocabulary', arena(1), read('sd-scale-lb', 'Load balancing'), read('sd-scale-cap', 'CAP & consistency trade-offs')),
  d(52, 'Caching at scale', warm(), read('sd-scale-cache', 'Caching layers'), design('a URL shortener')),
  d(53, 'Sharding', arena(1), read('sd-scale-shard', 'Sharding & partitioning')),
  d(54, 'Queues & events', warm(), read('sd-async-queue', 'Queue-based systems'), read('sd-async-event', 'Event-driven architecture')),
  d(55, 'Exactly-once is a lie', arena(1), read('sd-async-idem', 'Idempotent consumers'), read('sd-async-saga', 'Distributed sagas')),
  d(56, 'ARENA DAY', arena(3)),
  d(57, 'Consolidate + design rep', review(), quest(3), design('a rate limiter'), rest()),
  d(58, 'Microservices, honestly', arena(1), read('sd-arch-micro', 'Micro vs monolith — when each wins')),
  d(59, 'Gateways & edges', warm(), read('sd-arch-gateway', 'API gateways'), design('a news feed (fan-out problem)')),
  d(60, 'Observability', arena(1), read('sd-arch-observability', 'Logs, metrics, traces — debugging at scale')),
  d(61, 'The design interview itself', warm(), read('sd-arch-design', 'How to run the 45-minute design interview'), design('a chat system (WebSocket + presence + history)')),
  d(62, 'Design + code, same day', arena(2), design('Instagram stories')),
  d(63, 'ARENA DAY', arena(3)),
  d(64, 'Consolidate', review(), quest(3), rest()),
  d(65, 'Your AI edge: agents', arena(1), read('ai-llm-tools', 'Agentic tool-calling — you BUILT this in JARVIS')),
  d(66, 'Your AI edge: RAG', warm(), read('ai-rag-pipeline', 'RAG with citations'), say('JARVIS’s RAG pipeline from upload to cited answer, 2 minutes')),
  d(67, 'Production AI war story', arena(1), read('ai-agent-robust', 'Recovery engineering — your best interview story')),
  d(68, 'AI systems judgment', warm(), read('ai-agent-frameworks', 'LangChain vs raw — own the decision'), read('ai-ship-evals', 'Evals — how you verified JARVIS')),
  d(69, 'Design an AI product', arena(1), design('an AI assistant feature (model choice, RAG, cost, evals — your home turf)')),
  d(70, 'ARENA DAY', arena(3)),
  d(71, 'Consolidate', review(), quest(3), rest()),
  d(72, 'ARCHITECT COMPLETE', design('YouTube (storage, CDN, transcoding pipeline)'), say('🏁 Milestone: you can hold a 45-min design conversation. Now we drill for war.')),
]

// ── Phase 4 · WAR GAMES (Days 73–90): full-loop simulation ──────────────────
const war: CampaignDay[] = [
  d(73, 'Story bank I', arena(2), rehearse('defend-intro', 'The ownership test — then draft 5 STAR stories (conflict, failure, leadership, ambiguity, impact)')),
  d(74, 'Defend JARVIS', arena(2), rehearse('defend-jarvis', 'JARVIS defense — agentic loop, RAG, recovery, aloud, 10 min')),
  d(75, 'Defend the Order system', arena(2), rehearse('defend-ops', 'Order system — saga, queues, anomaly ML')),
  d(76, 'Defend Unity + gharKa', arena(1), rehearse('defend-unity', 'Unity — 38 models, RBAC'), rehearse('defend-gharka', 'gharKa — geo queries, OTP')),
  d(77, 'The career-switch story', arena(2), say('your arc: BITS civil → self-taught MERN → built JARVIS/Unity/Order — as a STRENGTH story of bets and follow-through, 90 seconds')),
  d(78, 'MOCK LOOP I', { label: 'Full simulation: Arena ×2 back-to-back (45 min each, no breaks) + 1 design aloud (45 min). Grade yourself after, not during.', href: '#/arena' }),
  d(79, 'Recover + patch', review(), warm('whatever broke yesterday'), rest()),
  d(80, 'Weakness week', arena(2), { label: 'Re-solve your 5 most-failed Arena problems, from blank' }),
  d(81, 'Design under pressure', arena(1), design('Uber (matching, location streams, surge)'), rehearse('defend-scalequest', 'scale-quest — the level engine')),
  d(82, 'Speed day', arena(3), say('every script in under 30 seconds each')),
  d(83, 'MOCK LOOP II', { label: 'Full simulation again: 2 coding + 1 design + 30 min behavioral (answer your 5 stories aloud to a wall — it works)', href: '#/arena' }),
  d(84, 'Recover', review(), rest()),
  d(85, 'Resume = claims you can defend', { label: 'Rewrite resume bullets as metric + verb + system (“cut RAG upload 25s→0.5s by baking the model into the image”). Every line must survive “tell me more.”' }),
  d(86, 'Apply + arena', arena(2), { label: 'Ship applications/referral asks to 10 targets. Momentum beats polish.' }),
  d(87, 'Final patterns sweep', arena(3)),
  d(88, 'MOCK LOOP III', { label: 'Last full loop. You should feel bored-competent in the coding rounds now — that’s the goal state.', href: '#/arena' }),
  d(89, 'Taper', review(), warm('two favorite problems — confidence reps, not new pain'), rest()),
  d(90, 'INTERVIEW-READY', say('🏁 The protocol from here: 2 Arena problems + 1 design rep per week to stay sharp. You didn’t read about the mountain — you climbed the training wall. Go book the real thing.'), rest()),
]

export const campaign: CampaignPhase[] = [
  { id: 'forge', title: 'Phase 1 · The Forge', days: 'Days 1–30', color: '#EF4444', why: 'Every FAANG loop starts with the coding gate. Blocked practice first: one pattern at a time, hands on keys, until each template is muscle memory.', entries: forge },
  { id: 'engine', title: 'Phase 2 · The Engine Room', days: 'Days 31–50', color: '#FB923C', why: 'Your profile is frontend-heavy — interviewers will probe backend depth. Event loop, SQL, indexes, caching, idempotency: the exact topics that filter “frontend dev” from “engineer.” Arena keeps patterns hot.', entries: engine },
  { id: 'architect', title: 'Phase 3 · The Architect', days: 'Days 51–72', color: '#818CF8', why: 'Design rounds decide your LEVEL, not just the offer. Vocabulary → trade-offs → live whiteboard reps — plus your AI edge, which most candidates cannot match.', entries: architect },
  { id: 'war', title: 'Phase 4 · War Games', days: 'Days 73–90', color: '#6EE7F9', why: 'Interviews are performance under time pressure. Full-loop simulation, story bank, defend-your-projects reps, and tapering — like an athlete, because that is what this is.', entries: war },
]

export const totalDays = 90
