export * from "./types";
export * from "./registry";

export * from "./paragraph";
export * from "./heading";
export * from "./callout";
export * from "./youtube";
export * from "./amazon-product";
export * from "./list";
export * from "./quote";
export * from "./code";
export * from "./related-posts";
export * from "./schema";
export * from "./image";

import { getAllBlocks } from "./registry";

export const blockDefinitions = getAllBlocks();

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

