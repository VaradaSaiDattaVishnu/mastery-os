// Runs user JavaScript + a test snippet inside a sandboxed Web Worker.
// The worker injects check()/expect() helpers and a captured console, then
// evals (userCode + tests) in one scope. Infinite loops are killed by timeout.

export interface TestResult {
  name: string
  passed: boolean
  error: string | null
}

export interface RunResult {
  ok: boolean
  results: TestResult[]
  logs: string[]
  error: string | null
  timedOut?: boolean
}

const WORKER_SRC = `
self.onmessage = function (ev) {
  var __results = [];
  var __logs = [];
  function fmt(x){ try { return (typeof x === 'object' && x !== null) ? JSON.stringify(x) : String(x); } catch (e) { return String(x); } }
  var console = {
    log:   function(){ __logs.push(Array.prototype.slice.call(arguments).map(fmt).join(' ')); },
    error: function(){ __logs.push(Array.prototype.slice.call(arguments).map(fmt).join(' ')); },
    warn:  function(){ __logs.push(Array.prototype.slice.call(arguments).map(fmt).join(' ')); },
    info:  function(){ __logs.push(Array.prototype.slice.call(arguments).map(fmt).join(' ')); }
  };
  function check(name, fn){
    try { var v = fn(); __results.push({ name: name, passed: v !== false, error: null }); }
    catch (e) { __results.push({ name: name, passed: false, error: (e && e.message) ? e.message : String(e) }); }
  }
  function expect(actual){
    function eq(a,b){ return JSON.stringify(a) === JSON.stringify(b); }
    return {
      toBe: function(e){ if (actual !== e) throw new Error('expected ' + fmt(e) + ', got ' + fmt(actual)); },
      toEqual: function(e){ if (!eq(actual,e)) throw new Error('expected ' + fmt(e) + ', got ' + fmt(actual)); },
      toBeCloseTo: function(e, eps){ eps = (eps == null ? 1e-6 : eps); if (Math.abs(actual - e) > eps) throw new Error('expected ~' + e + ', got ' + fmt(actual)); },
      toBeTruthy: function(){ if (!actual) throw new Error('expected truthy, got ' + fmt(actual)); },
      toBeFalsy: function(){ if (actual) throw new Error('expected falsy, got ' + fmt(actual)); },
      toThrow: function(){ var t=false; try { actual(); } catch(_) { t=true; } if(!t) throw new Error('expected function to throw'); }
    };
  }
  try {
    eval(ev.data.userCode + '\\n;\\n' + ev.data.tests);
    self.postMessage({ ok: true, results: __results, logs: __logs, error: null });
  } catch (e) {
    self.postMessage({ ok: false, results: __results, logs: __logs, error: (e && e.message) ? e.message : String(e) });
  }
};
`

export function runJs(userCode: string, tests: string, timeoutMs = 4000): Promise<RunResult> {
  return new Promise((resolve) => {
    let worker: Worker | null = null
    let url = ''
    let done = false
    const finish = (r: RunResult) => {
      if (done) return
      done = true
      try {
        worker?.terminate()
      } catch {
        /* noop */
      }
      if (url) URL.revokeObjectURL(url)
      resolve(r)
    }
    try {
      const blob = new Blob([WORKER_SRC], { type: 'application/javascript' })
      url = URL.createObjectURL(blob)
      worker = new Worker(url)
      const timer = setTimeout(
        () => finish({ ok: false, results: [], logs: [], error: 'Timed out — possible infinite loop.', timedOut: true }),
        timeoutMs,
      )
      worker.onmessage = (e: MessageEvent) => {
        clearTimeout(timer)
        finish(e.data as RunResult)
      }
      worker.onerror = (e: ErrorEvent) => {
        clearTimeout(timer)
        finish({ ok: false, results: [], logs: [], error: e.message || 'Worker error' })
      }
      worker.postMessage({ userCode, tests })
    } catch (e) {
      finish({ ok: false, results: [], logs: [], error: (e as Error).message })
    }
  })
}
