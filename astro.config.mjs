// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';

// `mdx()` stays, and only as a loader: the content collection reads Article bodies from
// `.mdx` bundles and nothing renders through it. ADR-0010 replaced component-based rendering
// with the Document Renderer, which emits HTML strings, so the auto-imported `.astro` block
// components and the Sätteri markdown processor were dead configuration — see the 2026-09-21
// amendment on ADR-0007.
//
// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    imageService: 'compile',
  }),
  integrations: [mdx()],
});