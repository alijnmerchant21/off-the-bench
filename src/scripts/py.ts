// One shared Python worker per page. Starts on first use.
type Msg = { id: number; type: string; [k: string]: any };
type Handler = (m: Msg) => void;

let worker: Worker | null = null;
let seq = 0;
const handlers = new Map<number, Handler>();
const statusListeners = new Set<(text: string) => void>();
let lastStatus = 'Not loaded';

function boot() {
  if (worker) return worker;
  worker = new Worker(new URL('/py/worker.js', location.href), { type: 'module' });
  worker.onmessage = (e: MessageEvent<Msg>) => {
    const m = e.data;
    if (m.type === 'status') { lastStatus = m.text; statusListeners.forEach((f) => f(m.text)); return; }
    handlers.get(m.id)?.(m);
  };
  worker.onerror = (e: ErrorEvent) => {
    console.error('Python worker failed:', e.message || e);
    lastStatus = 'Failed'; statusListeners.forEach((f) => f('Failed'));
    // Release anything waiting, so a failed load never leaves a button stuck.
    handlers.forEach((h, id) => h({ id, type: 'error', text: 'Python could not start in this browser. ' + (e.message || 'Reload the page and try again.') }));
    handlers.clear(); worker = null;
  };
  return worker;
}

export function onStatus(f: (text: string) => void) { statusListeners.add(f); f(lastStatus); return () => statusListeners.delete(f); }
export function isLoaded() { return lastStatus === 'Ready'; }

export function send(type: 'run' | 'train', payload: Record<string, any>, onMsg: Handler): Promise<Msg> {
  const w = boot();
  const id = ++seq;
  return new Promise((resolve) => {
    handlers.set(id, (m) => {
      onMsg(m);
      if (m.type === 'done' || m.type === 'error') { handlers.delete(id); resolve(m); }
    });
    w.postMessage({ id, type, ...payload });
  });
}

// Stop a long run by throwing the worker away. The next run starts a fresh one.
export function stop() {
  if (!worker) return;
  worker.terminate(); worker = null;
  handlers.forEach((h, id) => h({ id, type: 'error', text: 'Stopped.' }));
  handlers.clear();
  lastStatus = 'Not loaded'; statusListeners.forEach((f) => f(lastStatus));
}
