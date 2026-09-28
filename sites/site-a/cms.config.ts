import { defineConfig } from "cms/config";
import { customSiteBlocks } from "./src/blocks";

export default defineConfig({
  siteName: "Site A",
  contentDir: "sites/site-a/src/content/blog",
  uploadsDir: "sites/site-a/public/uploads",
  authors: [
    { id: "jeflopo", name: "Jef Lopo" },
    { id: "aflopo", name: "A Flopo" },
  ],
  blocks: customSiteBlocks,
  templates: [
    { id: "default", label: "Default (Single Column)" },
    { id: "two-column", label: "Two Columns (Article | Aside)" },
  ],
  settings: {
    defaults: {
      siteTitle: "Site A Blog",
      siteDescription: "High-performance publishing on Astro and Cloudflare",
    },
  },
});
