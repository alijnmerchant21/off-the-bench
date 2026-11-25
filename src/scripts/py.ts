// One shared Python worker per page. Starts on first use.
// Besides per-run messages, the worker broadcasts 'trace' (moves for the 3D view)
// and 'snapshot' (cell state) events that any part of the page can listen to.
type Msg = { id: number; type: string; [k: string]: any };
type Handler = (m: Msg) => void;

let worker: Worker | null = null;
let seq = 0;
const handlers = new Map<number, Handler>();
const statusListeners = new Set<(text: string) => void>();
const eventListeners = new Set<(m: Msg) => void>();
let lastStatus = 'Not loaded';
let lastSnapshot: any = null;

function boot() {
  if (worker) return worker;
  worker = new Worker(new URL('/py/worker.js', location.href), { type: 'module' });
  worker.onmessage = (e: MessageEvent<Msg>) => {
    const m = e.data;
    if (m.type === 'status') { lastStatus = m.text; statusListeners.forEach((f) => f(m.text)); return; }
    if (m.type === 'trace' || m.type === 'snapshot') {
      if (m.type === 'snapshot') lastSnapshot = m.data;
      eventListeners.forEach((f) => f(m));
      return;
    }
    handlers.get(m.id)?.(m);
  };
  worker.onerror = (e: ErrorEvent) => {
    console.error('Python worker failed:', e.message || e);
    lastStatus = 'Failed'; statusListeners.forEach((f) => f('Failed'));
    handlers.forEach((h, id) => h({ id, type: 'error', text: 'Python could not start in this browser. ' + (e.message || 'Reload the page and try again.') }));
    handlers.clear(); worker = null;
  };
  return worker;
}

export function start() { boot(); }
export function onStatus(f: (text: string) => void) { statusListeners.add(f); f(lastStatus); return () => statusListeners.delete(f); }
export function onEvent(f: (m: Msg) => void) { eventListeners.add(f); if (lastSnapshot) f({ id: 0, type: 'snapshot', data: lastSnapshot }); return () => eventListeners.delete(f); }
export function isLoaded() { return lastStatus === 'Ready'; }

export function send(type: 'run', payload: Record<string, any>, onMsg: Handler = () => {}): Promise<Msg> {
  const w = boot();
  const id = ++seq;
  return new Promise((resolve) => {
    handlers.set(id, (m) => {
      onMsg(m);
      if (m.type === 'done' || m.type === 'error' || m.type === 'refused') {
        handlers.delete(id); resolve(m);
        if (m.type !== 'error' && /cell\./.test(payload.code || '')) window.dispatchEvent(new CustomEvent('otb-result', { detail: m.type === 'done' ? 'ok' : 'refused' }));
      }
    });
    w.postMessage({ id, type, ...payload });
  });
}

// Stop a long run by throwing the worker away. The next run starts a fresh one (and a fresh cell).
export function stop() {
  if (!worker) return;
  worker.terminate(); worker = null;
  handlers.forEach((h, id) => h({ id, type: 'error', text: 'Stopped. The simulated cell was reset.' }));
  handlers.clear();
  lastStatus = 'Not loaded'; statusListeners.forEach((f) => f(lastStatus));
}
