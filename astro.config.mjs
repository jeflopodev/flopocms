// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import { satteriSchemaExtractor } from './src/plugins/satteri-schema-extractor.mjs';

// https://astro.build/config
export default defineConfig({
  markdown: {
    processor: satteri({
      mdastPlugins: [satteriSchemaExtractor()],
    }),
  },
  integrations: [mdx()],
});