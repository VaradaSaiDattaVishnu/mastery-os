A performance budget is a contract with your users; a flamegraph is the instrument that tells you where the budget is being spent. Guessing where the bottleneck is — without profiling first — is how skilled engineers waste weeks on the wrong problem.

## The core

**The profiling loop.** Measure → identify the heaviest node → change one thing → measure again. Every optimisation begins and ends with a measurement. Without a baseline, you can't know if you improved anything.

**Flamegraphs.** A flamegraph is a stacked bar chart where the x-axis is time (samples) and y-axis is the call stack. Each horizontal bar is a function; its width is proportional to the CPU time it or its callees consumed. You read it top-down: the widest bar at the top of a plateau is where your time goes. Narrow tall stacks are recursive or deep — usually fine. Flat wide bars are the hot functions to optimise.

**Browser profiling.** Chrome DevTools Performance tab records a CPU profile and renders it as a flamegraph (the "flame chart" view). For React, the React DevTools Profiler adds a component-level view: which component rendered, why, and how long. The Profiler wraps a subtree and records every render's duration and cause.

**Node.js / CLI profiling.** `node --prof` produces a V8 tick-based profile; `node --prof-process` converts it to a readable format. For production, clinic.js gives flamegraphs with zero code changes. For microbenchmarks, `tinybench` (or the older `benchmark.js`) is the standard.

**Performance budgets.** A budget is a number: "interactive in under 200ms", "bundle under 150KB gzipped", "p95 API latency under 300ms". Budgets belong in CI — a build that exceeds the bundle budget should fail the pipeline.

```ts
// CUBE: React Profiler API — programmatic measurement in tests/development
import { Profiler, type ProfilerOnRenderCallback } from 'react'

const onRender: ProfilerOnRenderCallback = (
  id,          // component tree id
  phase,       // 'mount' | 'update' | 'nested-update'
  actualDuration,    // time spent rendering the committed update
  baseDuration,      // estimated time without memoization
  startTime,
  commitTime,
) => {
  if (actualDuration > 16) {
    console.warn(`[Profiler] ${id} took ${actualDuration.toFixed(1)}ms (>${16}ms frame budget)`)
  }
}

function App() {
  return (
    <Profiler id="DataGrid" onRender={onRender}>
      <VirtualizedDataGrid rows={rows} />
    </Profiler>
  )
}
```

```ts
// Node.js: microbenchmark with tinybench
import { Bench } from 'tinybench'

const bench = new Bench({ time: 1000 }) // run each for 1 second

bench
  .add('naive O(n²) filter', () => {
    return rows.filter((r) => tags.includes(r.tag))
  })
  .add('Set-based O(n) filter', () => {
    const tagSet = new Set(tags)
    return rows.filter((r) => tagSet.has(r.tag))
  })

await bench.run()

console.table(bench.table())
// | Task name        | ops/sec | Average (ns) |
// | naive O(n²)      |   1,204 |      830,000 |
// | Set-based O(n)   | 142,800 |        7,000 |
```

```bash
# Webpack bundle analysis — visual map of what's large
npx webpack-bundle-analyzer stats.json

# Or with Vite
npx vite-bundle-visualizer

# Lighthouse CI budget enforcement
# lighthouserc.js
module.exports = {
  assert: {
    assertions: {
      'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
      'interactive':            ['error', { maxNumericValue: 5000 }],
      'resource-summary:script:size': ['error', { maxNumericValue: 153600 }], // 150KB
    },
  },
}
```

## In your project

CUBE's 2.5x interaction speed improvement and the tree-filter O(n²)→O(n) fix were found via profiling, not intuition. The React DevTools Profiler revealed the component re-rendering on every keypress; the flamegraph showed the filter loop as the dominant stack. Without the profiler, the likely "fix" would have been adding `memo()` everywhere — which addresses the symptom, not the cause.

## Tradeoffs & pitfalls

**Optimising before measuring.** The single most common mistake. A developer "knows" the bottleneck is the database and adds caching — but the profiler would have shown the bottleneck was actually a synchronous regex in the hot path. Premature optimisation is not just a waste of time; it adds complexity that obscures the real problem.

**Micro-benchmark fallacies.** Benchmarks measure the wrong thing if they use unrealistically small data, don't warm the JIT, or include I/O in the measured section. Always: warm up (run the function 100x before timing), use representative data sizes, and measure only the code path you care about.

**Profiling in development mode.** React's development build is 2-3x slower than production due to extra checks and DevTools instrumentation. Profile in production build mode (`NODE_ENV=production`) for numbers that represent real user experience.

**Treating `actualDuration` as ground truth.** The React Profiler's `actualDuration` is work done since the last committed render. A component can appear fast per-render while the problem is that it re-renders 80 times per second.

## Top-1% insight

The most powerful profiling insight is distinguishing **CPU-bound** from **memory-bound** performance. A wide flamegraph plateau in a JS sort means CPU work — algorithmic complexity fix needed. A GC pause spike (visible as a blank gap in the Chrome timeline, or in `--trace-gc` output) means memory pressure — you're creating too many short-lived objects, and the GC is blocking JS execution to collect them. These require opposite fixes: algorithmic changes vs object pooling / reducing allocation. Interviewers who ask "how would you diagnose a performance regression?" are checking whether you know to look at both CPU profiles and memory allocation timelines, not just one.
