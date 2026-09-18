import { amazonProductBlock } from "./amazon-product";
import { youtubeBlock } from "./youtube";
import { schemaBlock } from "./schema";
import { calloutBlock } from "./callout";
import { listBlock } from "./list";
import { relatedPostsBlock } from "./related-posts";

export const blockDefinitions = [
  amazonProductBlock,
  youtubeBlock,
  calloutBlock,
  listBlock,
  relatedPostsBlock,
  schemaBlock,
] as const;

export const blockImports = [
  {
    "./src/blocks/amazon-product/AmazonProduct.astro": [["default", "AmazonProduct"] as [string, string]],
    "./src/blocks/youtube/YouTube.astro": [["default", "YouTube"] as [string, string]],
    "./src/blocks/schema/Schema.astro": [["default", "Schema"] as [string, string]],
    "./src/blocks/callout/Callout.astro": [["default", "Callout"] as [string, string]],
    "./src/blocks/list/Ul.astro": [["default", "Ul"] as [string, string]],
    "./src/blocks/list/Ol.astro": [["default", "Ol"] as [string, string]],
    "./src/blocks/related-posts/RelatedPosts.astro": [["default", "RelatedPosts"] as [string, string]],
  },
];

export * from "./amazon-product";
export * from "./youtube";
export * from "./schema";
export * from "./callout";
export * from "./list";
export * from "./related-posts";
