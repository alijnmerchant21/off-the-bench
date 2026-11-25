# Run log (source material for the site)

## 2026-11-25: Station v0.1.0-beta.11 with no hardware

Machine: Linux arm64 VM (Ubuntu, aarch64), no USB devices attached.

```
curl -sSL -o st.tgz https://github.com/norma-core/norma-core/releases/download/v0.1.0-beta.11/station-linux-arm64.tar.gz
tar xzf st.tgz          # -> station, dataset-generator, dataset-mp4 (57.6 MB archive)
./station --version     # NormaCore.Dev station 0.1.0-beta.11 (79fd925)
./station --web --tcp
```

Result
- Starts in about 1 s. Web UI answers HTTP 200 on 8889. TCP (NormFS) open on 8888.
- With no station.yaml present, it writes a default one: st3215 + vesc-trampa + system-info + usb-video drivers enabled, inference queue `inference/normvla` with `st3215-bus: auto`.
- Creates queues including `st3215/inference`, `st3215/meta`, `st3215/tx`, `inference/normvla`, `inference/mirroring`. With no servos, `st3215/inference` stays empty.
- Log noise with no camera: `ERROR usbvideo::linux] Failed to create UVC context: -99`, then `WARN usbvideo::linux::ffi] UVC context is null` once per second.
- `WARN normfs-mem] arena exhausted: giving queue ... a private floor of 2 pages` for each queue at startup. Harmless.

Conclusion
- Station runs with no hardware, so the install page and the web UI can be followed on any machine.
- There is no simulated ST3215 bus. Only the Yahboom Dogzilla Lite driver has a `simulation` mode (station/src/main.rs). A simulated ElRobot needs our own stand-in (cellbot sim backend).

## Release notes vs binary
- beta.11 notes say "ElRobot gains HTTP + MCP inverse kinematics endpoints".
- In the beta.11 Linux binary: no `/mcp`, `/ik` or `/api/ik` route on 8889 (all 404), no IK or MCP strings, no CLI flag. Only `--elrobot-urdf-path`-style asset override is present.
- Main branch (8216c1b, 23 Nov): IK code lives in station-viewer (`src/devices/*/st3215-model.ts`); MCP only in `hardware/lamp/firmware`. Status: could not locate. Ask on Discord before writing about it.

## Releases (GitHub API, 25 Nov 2026)
beta.0 2026-03-20, beta.2 04-07, beta.3 04-14, beta.4 04-15, beta.5 04-21, beta.6 04-30, beta.7 05-11, beta.8 06-02, beta.9 07-03, beta.10 08-09, beta.11 11-23.
Repo created 2026-02-01. 685 stars, 104 forks, MIT.

## 2026-11-25: playground guard parity
`tests/parity_cellbot.py` runs 20 calls (moves, limits, step, drift, zone, unknown pose, offsets, e-stop) through cellbot's Cell in sim mode and through public/py/otb_cell.py. Result: 20/20 identical (refusal text, waypoints, zones). Stale data and over-current are injected in the browser sim. Their messages come from cellbot's station_backend and _wait_reached code paths.

ElRobot meshes: NormaCore's 19 STL files decimated from 12 MB to 1.9 MB (servos to 12% of faces, printed parts to 30%) for the web. URDF unchanged except mesh paths.
