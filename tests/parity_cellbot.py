"""Run the same calls through cellbot (sim mode) and through otb_cell, compare results."""
import asyncio, json, sys, shutil, tempfile, os
import pathlib
HERE = pathlib.Path(__file__).resolve().parent
# Usage: python tests/parity_cellbot.py  (needs ../norma-hack/cellbot with mode = "sim" in cell.toml)
CELLBOT = HERE.parent.parent / 'norma-hack' / 'cellbot'
sys.path.insert(0, str(CELLBOT)); sys.path.insert(0, str(HERE.parent / 'public' / 'py'))

SCENARIO = [
    ("status",), 
    ("move_joints", "elrobot", {"j2": 0.1}),
    ("move_joints", "elrobot", {"j2": 0.2}),            # step too big
    ("move_joints", "elrobot", {"j3": 0.25}),           # limit (0.75+0.25 > 0.97)
    ("move_joints", "elrobot", {"j9": 0.1}),            # unknown joint
    ("move_joints", "elrobot", {"gripper": 0.1}),       # gripper via move_joints
    ("go_to_pose", "elrobot", "mark_hover_1"),
    ("go_to_pose", "so101", "place"),                    # zone refused
    ("move_joints", "elrobot", {"j1": 0.1}),
    ("move_joints", "elrobot", {"j1": 0.1}),
    ("move_joints", "elrobot", {"j1": 0.1}),             # drift from taught pose
    ("go_to_pose", "elrobot", "nope"),
    ("go_to_pose", "elrobot", "mark_touch_2", "normal", {"j1": 0.2}),  # offset too big
    ("go_home", "elrobot"),
    ("go_to_pose", "so101", "place"),
    ("go_to_pose", "elrobot", "mark_hover_3"),           # zone refused (so101 in work)
    ("go_home", "so101"),
    ("stop", "hand in the work area"),
    ("go_to_pose", "elrobot", "mark_hover_3"),           # estop latched
    ("move_joints", "elrobot", {"j1": 0.05}),
]

def clean(r):
    if isinstance(r, dict):
        return {k: clean(v) for k, v in r.items() if k not in ("seconds", "t", "mode", "cameras", "part", "learning", "backend")}
    return r

async def run(cell, release=None):
    out = []
    for step in SCENARIO:
        name, *args = step
        try:
            if name == "status":
                r = await cell.status() if asyncio.iscoroutinefunction(cell.status) else cell.status()
                r = {"zones": {a: v["zone"] if isinstance(v, dict) and "zone" in v else None for a, v in r.get("arms", {}).items()}}
            else:
                r = await getattr(cell, name)(*args)
            out.append(("ok", clean(r)))
        except Exception as e:
            out.append((type(e).__name__, str(e)))
    return out

async def main():
    tmp = tempfile.mkdtemp(); os.chdir(CELLBOT)
    from cellbot.config import load_config
    from cellbot.cell import Cell as CB
    cfg = load_config()
    # isolate state
    sd = cfg.state_dir
    for f in ("estop.json", "events.jsonl"):
        p = sd / f
        if p.exists(): p.unlink()
    cb = CB(cfg)
    a = await run(cb)
    import otb_cell
    b = await run(otb_cell.Cell())
    bad = 0
    for i, (x, y) in enumerate(zip(a, b)):
        same = x == y
        if not same and x[0] == "ok" and y[0] == "ok":
            # compare only shared keys
            same = all(x[1].get(k) == y[1].get(k) for k in y[1] if k in x[1]) and set(y[1]) <= set(x[1])
        print(("SAME " if same else "DIFF ") + str(SCENARIO[i][:2]))
        if not same:
            bad += 1; print("  cellbot:", x); print("  otb    :", y)
    print(f"\n{len(SCENARIO)-bad}/{len(SCENARIO)} identical")
    p = sd / "estop.json"
    if p.exists(): p.unlink()

asyncio.run(main())
