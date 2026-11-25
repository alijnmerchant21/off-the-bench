// Sidebar for /docs. Order here is the reading order.
export const DOCS_NAV: { group: string; items: [string, string][] }[] = [
  {
    group: 'Get started',
    items: [
      ['/docs', 'Overview'],
      ['/docs/install', 'Install Station'],
      ['/docs/quickstart', 'Your first hour'],
      ['/docs/concepts', 'Key concepts'],
    ],
  },
  {
    group: 'Build',
    items: [
      ['/docs/python-client', 'Python client'],
      ['/docs/datasets-and-policies', 'Datasets and SmolVLA'],
      ['/docs/agents-and-mcp', 'Agents and MCP'],
    ],
  },
  {
    group: 'Reference',
    items: [
      ['/docs/troubleshooting', 'Troubleshooting'],
      ['/docs/simulator-vs-hardware', 'Simulator and hardware'],
    ],
  },
];
export const DOCS_FLAT = DOCS_NAV.flatMap((g) => g.items);
