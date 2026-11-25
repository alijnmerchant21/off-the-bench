// Runs Python in a background thread with Pyodide, so the page never freezes.
// Messages in:  {id, type: 'run', code}  |  {id, type: 'train', cfg}
// Messages out: {id, type: 'stdout'|'plot'|'progress'|'done'|'error', ...}
// A module worker: loads Pyodide as an ES module from the CDN.
import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs';
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';

let current = null;
const post = (m) => self.postMessage(Object.assign({ id: current }, m));

const ready = (async () => {
  post({ type: 'status', text: 'Downloading Python' });
  const py = await loadPyodide({ indexURL: PYODIDE });
  post({ type: 'status', text: 'Loading NumPy' });
  await py.loadPackage('numpy', { messageCallback: () => {} });
  const src = await (await fetch(new URL('btt_np.py', self.location.href))).text();
  py.FS.writeFile('/home/pyodide/btt_np.py', src);
  py.registerJsModule('bttjs', {
    plot: (json) => post({ type: 'plot', data: JSON.parse(json) }),
    progress: (step, loss) => post({ type: 'progress', step, loss }),
  });
  py.runPython(`
import sys, json
sys.path.insert(0, '/home/pyodide')
import numpy as np

def show(x, title='', **series):
    """Draw a line chart under the cell. show(x, target=y, model=p)."""
    import bttjs
    clean = lambda a: [None if not np.isfinite(v) else round(float(v), 6) for v in np.asarray(a, dtype=float).ravel()]
    bttjs.plot(json.dumps({'title': title, 'x': clean(x), 'series': {k: clean(v) for k, v in series.items()}}))
`);
  py.setStdout({ batched: (text) => post({ type: 'stdout', text: text + '\n' }) });
  py.setStderr({ batched: (text) => post({ type: 'stdout', text: text + '\n', err: true }) });
  post({ type: 'status', text: 'Ready' });
  return py;
})();

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
  try {
    if (type === 'run') {
      await py.loadPackagesFromImports(e.data.code, { messageCallback: () => {}, errorCallback: () => {} });
      const r = await py.runPythonAsync(e.data.code);
      let value = null;
      if (r !== undefined && r !== null) { value = String(r); if (r.destroy) r.destroy(); }
      post({ type: 'done', value, ms: Math.round(performance.now() - t0) });
    } else if (type === 'train') {
      py.globals.set('_cfg_json', JSON.stringify(e.data.cfg));
      const out = await py.runPythonAsync(`
import json, time, bttjs
import btt_np as E
_cfg = json.loads(_cfg_json)
_t0 = time.time()
_m, _losses = E.train(_cfg, on_progress=lambda s, l: bttjs.progress(s, l), every=max(1, _cfg['epochs'] // 100))
_secs = round(time.time() - _t0, 1)
_x, _y, _ev, _zero = E.evaluate(_m, _cfg['target'])
_step = max(1, len(_x) // 200)
_lstep = max(1, len(_losses) // 200)
json.dumps({
  'params': _m.params, 'train_secs': _secs, 'zero': _zero,
  'x': [round(float(v), 5) for v in _x[::_step]], 'truth': [round(float(v), 5) for v in _y[::_step]],
  'paths': {k: {'mse': v['mse'], 'pred': [round(float(p), 5) for p in v['pred'][::_step]]} for k, v in _ev.items()},
  'loss_every': _lstep, 'losses': [round(float(l), 6) for l in _losses[::_lstep]],
  'final_loss': float(sum(_losses[-100:]) / len(_losses[-100:])),
})
`);
      post({ type: 'done', value: out, ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    const msg = String(err && err.message || err);
    // Show only the Python traceback lines the reader wrote, not Pyodide internals.
    const lines = msg.split('\n');
    const i = lines.findIndex((l) => l.includes('File "<exec>"'));
    post({ type: 'error', text: (i >= 0 ? lines.slice(i) : lines.slice(-6)).join('\n') });
  }
};
