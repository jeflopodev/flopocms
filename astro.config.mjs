// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import AutoImport from 'astro-auto-import';
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import { satteriSchemaExtractor } from './src/plugins/satteri-schema-extractor.mjs';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
    imageService: 'compile',
  }),
  integrations: [
    AutoImport({
      imports: [
        './src/components/amazon-product.astro',
        './src/components/youtube.astro',
        './src/components/schema.astro',
      ],
    }),
    mdx(),
  ],
  markdown: {
    processor: satteri({
      mdastPlugins: [satteriSchemaExtractor()],
    }),
  },
});