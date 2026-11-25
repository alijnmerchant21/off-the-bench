import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://off-the-bench.pages.dev',
  integrations: [mdx()],
  markdown: { shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: 'light', wrap: false } },
  trailingSlash: 'ignore',
  build: { format: 'directory', assets: 'assets' },
});
