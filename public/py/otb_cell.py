"""A simulated, guarded ElRobot cell for the Off the Bench playground.

This is a browser port of the guard layer from the Floor Truth cell server
(cellbot/cell.py), run against a tiny simulated Station. The rules and the
refusal messages are the same as cellbot's. What is simulated:

  * Two arms on one Station: an ElRobot (j1..j7 + gripper) and an SO-101.
  * Joint positions are NORMALIZED: 0.0 = calibrated range_min, 1.0 = range_max,
    the same convention as Station's normvla position_norm. In the 3D view,
    0 and 1 map to the URDF joint limits. On a real arm they map to your calibration.
  * The servos reach every waypoint exactly. Real servos lag and sag.

Toggles (sim only): sim.stale, sim.overcurrent_joint, sim.so101_zone.
"""

from __future__ import annotations

import json
import math

GUARD = {
    "limit_margin": 0.03,
    "max_delta_per_call": 0.15,
    "interp_step": 0.04,
    "max_speed": 900,
    "max_accel": 40,
    "slow_speed": 300,
    "current_limit": 500,
    "reach_tolerance": 0.02,
}

ARMS = {
    "elrobot": {
        "joint_names": ["j1", "j2", "j3", "j4", "j5", "j6", "j7", "gripper"],
        "gripper": "gripper", "gripper_open": 0.80, "gripper_closed": 0.15,
        "home_pose": "home", "envelope": {},
    },
    "so101": {
        "joint_names": ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"],
        "gripper": "gripper", "gripper_open": 0.85, "gripper_closed": 0.10,
        "home_pose": "home", "envelope": {"shoulder_lift": [0.10, 0.90]},
    },
}


def _el(j1, j2, j3, j4):
    return {"j1": j1, "j2": j2, "j3": j3, "j4": j4, "j5": 0.5, "j6": 0.5, "j7": 0.5}


# Taught poses from the Floor Truth sim pose file (poses.sim.json).
POSES = {
    "elrobot": {
        "home": {"joints": {"j1": 0.5, "j2": 0.25, "j3": 0.75, "j4": 0.5, "j5": 0.5, "j6": 0.5, "j7": 0.5}, "zone": "clear"},
        "mark_hover_1": {"joints": _el(0.44, 0.45, 0.44, 0.45), "zone": "work"},
        "mark_touch_1": {"joints": _el(0.44, 0.55, 0.44, 0.40), "zone": "work"},
        "mark_hover_2": {"joints": _el(0.56, 0.45, 0.44, 0.45), "zone": "work"},
        "mark_touch_2": {"joints": _el(0.56, 0.55, 0.44, 0.40), "zone": "work"},
        "mark_hover_3": {"joints": _el(0.56, 0.45, 0.56, 0.45), "zone": "work"},
        "mark_touch_3": {"joints": _el(0.56, 0.55, 0.56, 0.40), "zone": "work"},
        "mark_hover_4": {"joints": _el(0.44, 0.45, 0.56, 0.45), "zone": "work"},
        "mark_touch_4": {"joints": _el(0.44, 0.55, 0.56, 0.40), "zone": "work"},
    },
    "so101": {
        "home": {"joints": {"shoulder_pan": 0.5, "shoulder_lift": 0.2, "elbow_flex": 0.8, "wrist_flex": 0.5, "wrist_roll": 0.5}, "zone": "clear"},
        "place": {"joints": {"shoulder_pan": 0.55, "shoulder_lift": 0.55, "elbow_flex": 0.5, "wrist_flex": 0.4, "wrist_roll": 0.5}, "zone": "work"},
    },
}


class GuardError(Exception):
    """A command was refused by a guardrail. The message says why."""


class EStopped(GuardError):
    pass


def _arm_joints(arm):
    a = ARMS[arm]
    return [j for j in a["joint_names"] if j != a["gripper"]]


# ------------------------------------------------------------------ the sim

class SimStation:
    """Stands in for Station plus servos. Records every goal it is sent."""

    def __init__(self):
        self.joints = {}
        for name, a in ARMS.items():
            home = POSES[name][a["home_pose"]]["joints"]
            self.joints[name] = {j: home.get(j, 0.5) for j in _arm_joints(name)}
            self.joints[name][a["gripper"]] = a["gripper_open"]
        self.goals = {a: dict(j) for a, j in self.joints.items()}
        self.current = {a: {j: 20 for j in js} for a, js in self.joints.items()}
        # toggles
        self.stale = False
        self.overcurrent_joint = None      # e.g. "j3": that joint draws 620 on the next move
        self.trace = []                    # every write, for the 3D view

    def read_state(self):
        if self.stale:
            raise RuntimeError("Station joint data is stale (>1 s old)")
        out = {}
        for a, js in self.joints.items():
            out[a] = {j: {"pos": v, "goal": self.goals[a][j], "current": self.current[a][j],
                          "torque": True, "error": 0} for j, v in js.items()}
        return out

    def write_goals(self, arm, goals, speed, accel):
        for j, v in goals.items():
            self.goals[arm][j] = v
            self.joints[arm][j] = v
            if self.overcurrent_joint == j:
                self.current[arm][j] = 620
        self.trace.append({"arm": arm, "joints": dict(self.joints[arm]), "speed": speed})

    def freeze(self, arm):
        self.goals[arm] = dict(self.joints[arm])
        self.trace.append({"arm": arm, "joints": dict(self.joints[arm]), "freeze": True})


# ----------------------------------------------------------- the guarded cell

class Cell:
    def __init__(self):
        self.g = GUARD
        self.sim = SimStation()
        self.zone = {a: "clear" for a in ARMS}
        self.last_pose = {a: ARMS[a]["home_pose"] for a in ARMS}
        self.estop = {"latched": False}
        self.events = []

    # helpers, as in cellbot
    def _check_estop(self):
        if self.estop.get("latched"):
            raise EStopped(
                f"E-STOP is latched ({self.estop.get('reason', 'no reason')}). No motion until a human "
                "releases it with `python -m cellbot.estop release`."
            )

    def log_event(self, kind, message, **extra):
        e = {"kind": kind, "message": message, **extra}
        self.events.append(e)
        return e

    def _limits(self, arm, joint):
        m = float(self.g["limit_margin"])
        lo, hi = m, 1.0 - m
        env = ARMS[arm]["envelope"].get(joint)
        if env:
            lo, hi = max(lo, env[0]), min(hi, env[1])
        return lo, hi

    def _check_limits(self, arm, target):
        names = ARMS[arm]["joint_names"]
        bad = []
        for j, v in target.items():
            if j not in names:
                raise GuardError(f"{arm} has no joint '{j}'. Joints: {names}")
            if not isinstance(v, (int, float)) or math.isnan(v):
                raise GuardError(f"{arm}.{j}: target must be a number")
            lo, hi = self._limits(arm, j)
            if not (lo <= v <= hi):
                bad.append(f"{j}={v:.3f} outside [{lo:.2f}, {hi:.2f}]")
        if bad:
            raise GuardError(f"{arm}: refused, joint limits: " + "; ".join(bad))

    def _other(self, arm):
        return next(a for a in ARMS if a != arm)

    def _check_zone(self, arm, target_zone):
        if target_zone == "work":
            other = self._other(arm)
            if self.zone[other] != "clear":
                raise GuardError(
                    f"{arm}: refused, the work area is not free: {other} is "
                    f"{'in the work area' if self.zone[other] == 'work' else 'at an unknown position'}. "
                    f"Send {other} to a clear pose (e.g. go_home) first."
                )

    def _move(self, arm, target, speed=None):
        self._check_estop()
        gripper = ARMS[arm]["gripper"]
        speed = int(min(speed or self.g["max_speed"], self.g["max_speed"]))
        accel = int(self.g["max_accel"])
        state = self.sim.read_state()
        cur = {j: state[arm][j]["pos"] for j in target}
        biggest = max((abs(target[j] - cur[j]) for j in target), default=0.0)
        n = max(1, math.ceil(biggest / float(self.g["interp_step"])))
        for i in range(1, n + 1):
            self._check_estop()
            wp = {j: cur[j] + (target[j] - cur[j]) * i / n for j in target}
            self.sim.write_goals(arm, wp, speed, accel)
            reached = self._wait_reached(arm, wp, final=(i == n))
            if not reached["ok"]:
                return {"ok": False, **reached, "waypoint": f"{i}/{n}"}
        state = self.sim.read_state()
        err = {j: round(abs(state[arm][j]["pos"] - target[j]), 3) for j in target if j != gripper}
        return {"ok": True, "waypoints": n, "max_error": max(err.values(), default=0.0)}

    def _wait_reached(self, arm, wp, final):
        gripper = ARMS[arm]["gripper"]
        tol = float(self.g["reach_tolerance"]) * (1.0 if final else 2.5)
        limit = int(self.g["current_limit"])
        state = self.sim.read_state()
        js = state[arm]
        over = {j: js[j]["current"] for j in wp if j != gripper and js[j]["current"] > limit}
        if over:
            self._emergency(f"over-current on {arm} {over} (possible collision)")
            return {"ok": False, "error": f"over-current {over}; both arms frozen and e-stop latched"}
        if all(abs(js[j]["pos"] - wp[j]) <= tol for j in wp if j != gripper):
            return {"ok": True}
        self.sim.freeze(arm)
        return {"ok": False, "error": "timeout: not reached, arm held where it is."}

    def _freeze_all(self):
        for a in ARMS:
            self.sim.freeze(a)

    def _emergency(self, reason):
        self.estop = {"latched": True, "reason": reason}
        self._freeze_all()
        self.log_event("estop", reason)

    # -------------------------------------------------------------- public API
    def status(self):
        state = self.sim.read_state()
        arms = {}
        for a in ARMS:
            arms[a] = {"zone": self.zone[a], "last_pose": self.last_pose[a],
                       "joints": {j: round(v["pos"], 3) for j, v in state[a].items()}}
        return {"mode": "SIMULATION (in your browser)", "estop": self.estop, "arms": arms}

    async def go_to_pose(self, arm, pose, speed="normal", offsets=None):
        if arm not in ARMS:
            raise GuardError(f"unknown arm {arm!r}; arms are {list(ARMS)}")
        if pose not in POSES[arm]:
            raise GuardError(f"No pose '{pose}' for arm '{arm}'. Known: {sorted(POSES[arm])}")
        p = POSES[arm][pose]
        target = dict(p["joints"])
        for j, d in (offsets or {}).items():
            if abs(d) > float(self.g["max_delta_per_call"]):
                raise GuardError(f"{arm}: correction {j}{d:+.3f} is bigger than max_delta_per_call")
            target[j] = target[j] + d
        self._check_limits(arm, target)
        self._check_estop()
        self._check_zone(arm, p["zone"])
        if p["zone"] == "work":
            self.zone[arm] = "work"
        sp = self.g["slow_speed"] if speed == "slow" or self.zone[arm] == "unknown" else self.g["max_speed"]
        res = self._move(arm, target, sp)
        if res["ok"]:
            self.zone[arm] = p["zone"]
            self.last_pose[arm] = pose
        else:
            self.zone[arm] = "unknown" if p["zone"] == "clear" else "work"
            self.last_pose[arm] = None
        return {"arm": arm, "pose": pose, **res, "zone": self.zone[arm]}

    async def go_home(self, arm):
        return await self.go_to_pose(arm, ARMS[arm]["home_pose"], speed="slow")

    async def move_joints(self, arm, joints, relative=True):
        """Small local adjustment near the last taught pose."""
        if arm not in ARMS:
            raise GuardError(f"unknown arm {arm!r}")
        gripper = ARMS[arm]["gripper"]
        if gripper in joints:
            raise GuardError("use the gripper tool for the gripper")
        base_name = self.last_pose[arm]
        if base_name is None:
            raise GuardError(f"{arm}: position unknown; go to a taught pose first (e.g. go_home)")
        state = self.sim.read_state()
        cur = {j: state[arm][j]["pos"] for j in _arm_joints(arm)}
        target = {j: (cur[j] + v if relative else v) for j, v in joints.items()}
        self._check_limits(arm, target)
        md = float(self.g["max_delta_per_call"])
        too_big = {j: round(target[j] - cur[j], 3) for j in target if abs(target[j] - cur[j]) > md}
        if too_big:
            raise GuardError(f"{arm}: refused, step too big {too_big} (max {md} per call). Use a taught pose.")
        base = POSES[arm][base_name]["joints"]
        drift = {j: round(target[j] - base[j], 3) for j in target if abs(target[j] - base.get(j, cur[j])) > 2 * md}
        if drift:
            raise GuardError(f"{arm}: refused, too far from taught pose '{base_name}' {drift} (max {2*md}).")
        self._check_estop()
        res = self._move(arm, target, self.g["slow_speed"])
        return {"arm": arm, **res}

    async def gripper(self, arm, action="", position=None):
        a = ARMS[arm]
        if position is None:
            if action not in ("open", "close"):
                raise GuardError("action must be 'open' or 'close', or give a position")
            position = a["gripper_open"] if action == "open" else a["gripper_closed"]
        self._check_limits(arm, {a["gripper"]: position})
        self._check_estop()
        res = self._move(arm, {a["gripper"]: position}, self.g["slow_speed"])
        return {"arm": arm, "gripper": position, **res}

    async def stop(self, reason):
        self._emergency(f"stop requested by orchestrator: {reason}")
        return {"ok": True, "estop": self.estop}

    # sim only: the human release step
    def release_estop(self):
        self.estop = {"latched": False}
        self.sim.overcurrent_joint = None
        for a in ARMS:
            for j in self.sim.current[a]:
                self.sim.current[a][j] = 20
        return {"released": True}


cell = Cell()


def take_trace():
    """Hand the moves since the last call to the 3D view, and clear them."""
    t = cell.sim.trace
    cell.sim.trace = []
    return json.dumps(t)


def snapshot():
    """Cell state for the page: zones, poses, e-stop and joints, read past the stale check."""
    return json.dumps({
        "zone": cell.zone, "last_pose": cell.last_pose, "estop": cell.estop,
        "stale": cell.sim.stale, "overcurrent_joint": cell.sim.overcurrent_joint,
        "joints": {a: {j: round(v, 4) for j, v in js.items()} for a, js in cell.sim.joints.items()},
    })
