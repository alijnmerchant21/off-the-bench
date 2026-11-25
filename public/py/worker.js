// Runs Python in a background thread with Pyodide, so the page never freezes.
// It loads otb_cell.py, a simulated Station with the Floor Truth guard layer in front of it.
// Messages in:  {id, type: 'run', code}
// Messages out: {id, type: 'stdout'|'refused'|'done'|'error'|'trace'|'snapshot'|'status', ...}
import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs';
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';

let current = null;
const post = (m) => self.postMessage(Object.assign({ id: current }, m));

const ready = (async () => {
  post({ type: 'status', text: 'Downloading Python' });
  const py = await loadPyodide({ indexURL: PYODIDE });
  post({ type: 'status', text: 'Starting the simulated Station' });
  const src = await (await fetch(new URL('otb_cell.py', self.location.href))).text();
  py.FS.writeFile('/home/pyodide/otb_cell.py', src);
  py.runPython(`
import sys, json
sys.path.insert(0, '/home/pyodide')
import otb_cell
from otb_cell import cell, GuardError, EStopped
sim = cell.sim
`);
  py.setStdout({ batched: (text) => post({ type: 'stdout', text: text + '\n' }) });
  py.setStderr({ batched: (text) => post({ type: 'stdout', text: text + '\n', err: true }) });
  post({ type: 'status', text: 'Ready' });
  post({ type: 'snapshot', data: JSON.parse(py.runPython('otb_cell.snapshot()')) });
  return py;
})();

function flush(py) {
  try {
    const trace = JSON.parse(py.runPython('otb_cell.take_trace()'));
    if (trace.length) post({ type: 'trace', data: trace });
    post({ type: 'snapshot', data: JSON.parse(py.runPython('otb_cell.snapshot()')) });
  } catch (e) { /* the page keeps its last state */ }
}

self.onmessage = async (e) => {
  const { id, type } = e.data;
  current = id;
  let py;
  try {
    py = await ready;
  } catch (err) {
    post({ type: 'error', text: 'Python could not load. Check your connection and reload the page.\n' + String(err) });
    return;
  }
  const t0 = performance.now();
  if (type !== 'run') return;
  try {
    const r = await py.runPythonAsync(e.data.code);
    let value = null;
    if (r !== undefined && r !== null) { value = String(r); if (r.destroy) r.destroy(); }
    flush(py);
    post({ type: 'done', value, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    flush(py);
    const msg = String(err && err.message || err);
    const lines = msg.trim().split('\n');
    const last = lines[lines.length - 1] || '';
    // A guardrail said no. Show it as a refusal, not as a crash.
    const g = /^(?:otb_cell\.)?(GuardError|EStopped): ([\s\S]*)$/.exec(last);
    if (g) { post({ type: 'refused', kind: g[1], text: g[2], ms: Math.round(performance.now() - t0) }); return; }
    if (/RuntimeError: Station joint data is stale/.test(last)) {
      post({ type: 'refused', kind: 'Stale', text: last.replace(/^RuntimeError: /, ''), ms: Math.round(performance.now() - t0) }); return;
    }
    const i = lines.findIndex((l) => l.includes('File "<exec>"'));
    post({ type: 'error', text: (i >= 0 ? lines.slice(i) : lines.slice(-6)).join('\n') });
  }
};
