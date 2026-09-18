// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import AutoImport from 'astro-auto-import';
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import { satteriSchemaExtractor } from './src/plugins/satteri-schema-extractor.mjs';
import { blockImports } from './src/blocks/index.ts';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    imageService: 'compile',
  }),
  integrations: [
    AutoImport({
      imports: blockImports,
    }),
    mdx(),
  ],
  markdown: {
    processor: satteri({
      mdastPlugins: [satteriSchemaExtractor()],
    }),
  },
});