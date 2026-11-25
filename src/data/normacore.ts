// NormaCore facts, each from a NormaCore primary source or from our own run log.
// Checked on 25 November 2026. If a value changes upstream, change it here and the pages follow.
export const CHECKED = '25 November 2026';

const GH = 'https://github.com/norma-core/norma-core';
export const SRC = {
  readme: { label: 'norma-core README', url: `${GH}#readme` },
  elrobot: { label: 'ElRobot README', url: `${GH}/tree/main/hardware/elrobot` },
  station: { label: 'Station README', url: `${GH}/tree/main/software/station/bin/station` },
  rel: { label: 'Releases on GitHub', url: `${GH}/releases` },
  b11: { label: 'v0.1.0-beta.11 notes, 23 Nov 2026', url: `${GH}/releases/tag/v0.1.0-beta.11` },
  normfs: { label: 'NormFS README', url: 'https://github.com/norma-core/normfs' },
  smolvla: { label: 'smolvla_py README', url: `${GH}/tree/main/software/ai/smolvla_py` },
  export: { label: 'Dataset export guide', url: `${GH}/blob/main/docs/datasets/export-parquet/datasets-export.md` },
  examples: { label: 'Station examples', url: `${GH}/tree/main/software/station/examples` },
  drivers: { label: 'Drivers folder', url: `${GH}/tree/main/software/drivers` },
  field: { label: 'normacore.dev, In the Field', url: 'https://normacore.dev/deployments/' },
  pod: { label: 'normacore.dev, Pod', url: 'https://normacore.dev/opensource/pod/' },
  site: { label: 'normacore.dev', url: 'https://normacore.dev/' },
  runlog: { label: 'Our run log, 25 Nov 2026', url: '/docs/install' },
  lab: { label: 'Our lab results', url: '/lab' },
} as const;
export type SrcKey = keyof typeof SRC;

export const STACK: { pop: string; layer: string; name: string; what: string; facts: [string, string][]; src: SrcKey[] }[] = [
  {
    pop: 'lilac', layer: 'The arm',
    name: 'ElRobot',
    what: 'A fully 3D-printed arm with seven joints and a gripper, built for imitation learning. A leader arm you move by hand drives a follower arm that copies it.',
    facts: [['Joints', '7 + gripper'], ['Reach', '430 mm'], ['Weight', 'about 800 g'], ['Cost', 'about $220 per arm']],
    src: ['elrobot'],
  },
  {
    pop: 'butter', layer: 'The motors',
    name: 'ST3215 serial servos',
    what: 'Eight bus servos per arm, chained on one serial line and read through a small USB driver board. Leader and follower use different servos and different power.',
    facts: [['Follower', '8 × ST3215, 12 V'], ['Leader', '8 × ST3215, 7.4 V'], ['Power', '12 V/4 A follower, 5 V/3 A leader']],
    src: ['elrobot'],
  },
  {
    pop: 'peach', layer: 'The runtime',
    name: 'Station',
    what: 'One binary that finds the hardware, runs the drivers, records everything and serves a web UI. Your code talks to it over TCP. It also runs with no robot attached.',
    facts: [['Ports', 'TCP 8888, web 8889'], ['Runs on', 'macOS, Linux (x86 and ARM)'], ['Latest', 'v0.1.0-beta.11'], ['License', 'MIT']],
    src: ['station', 'b11', 'runlog'],
  },
  {
    pop: 'sky', layer: 'The storage',
    name: 'NormFS',
    what: 'A persistent queue store under Station. Every motor reading, command and camera frame lands in a named queue, so the whole history can be replayed or exported.',
    facts: [['Model', 'named queues, for example st3215/inference'], ['Pipeline', 'memory, WAL, store, cloud'], ['Clients', 'Rust, C/C++, Go']],
    src: ['normfs', 'b11'],
  },
  {
    pop: 'mint', layer: 'Your code',
    name: 'Python and Go clients',
    what: 'Follow a queue to read state. Send driver commands to move motors. The messages are Protobuf, through NormaCore\'s own Gremlin SDK.',
    facts: [['Read', 'client.follow(queue)'], ['Write', 'send_commands(client, [...])'], ['Status', 'work in progress, per the README']],
    src: ['station', 'readme'],
  },
  {
    pop: 'rose', layer: 'The policy',
    name: 'SmolVLA fine-tune',
    what: 'Export recorded episodes to Parquet, fine-tune a SmolVLA policy on a GPU, then run it back on the arm through Station.',
    facts: [['Data', 'Parquet export from Station'], ['Train', 'local GPU or cloud'], ['Deploy', 'on the SO-101 via Station']],
    src: ['smolvla', 'export'],
  },
];

export const IN_STATION = ['Hardware discovery', 'ST3215 and camera drivers', 'Calibration', 'Leader to follower mirroring', 'Recording every reading', 'Dataset export', 'Web viewer'];
export const IN_YOUR_CODE = ['Reading state streams', 'Sending motor goals', 'Task rules and workspace limits', 'Vision', 'Policies and agents'];

export const TIMELINE: { date: string; text: string; src: SrcKey }[] = [
  { date: 'Feb 2026', text: 'The norma-core repository is created on GitHub, MIT licensed.', src: 'readme' },
  { date: 'Mar 2026', text: 'First Station pre-release, v0.1.0-beta.0.', src: 'rel' },
  { date: 'Apr to Jun 2026', text: 'Seven more betas in eight weeks, beta.2 to beta.8.', src: 'rel' },
  { date: 'Jun 2026', text: 'First Berlin Robotics x AI Hackathon. Five teams ship projects on ElRobot and Station.', src: 'field' },
  { date: 'Jul 2026', text: 'A NormaCore Pod goes live in a vineyard in Cebreros, Spain.', src: 'pod' },
  { date: 'Aug 2026', text: 'v0.1.0-beta.10 released.', src: 'rel' },
  { date: 'Nov 2026', text: 'HackLab 2 in Berlin. Our team runs a two-arm cell on one Station with Claude Code.', src: 'lab' },
  { date: '23 Nov 2026', text: 'v0.1.0-beta.11: VP8 camera pipeline, NormFS 0.4.12, the Lamp, Intel Mac builds.', src: 'b11' },
];

// Our own numbers, from the 22 Nov runs on real hardware. Raw data on /lab.
export const BENCH = {
  aim: [24.3, 5.6, 2.5],
  heightBefore: 15.6, heightAfter: 2,
  tools: 25, guardsFired: 11, guardsTotal: 18,
};
