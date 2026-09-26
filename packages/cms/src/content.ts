import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { TEMPLATE_IDS } from "./lib/article-write-model";

/**
 * The `blog` collection, as the CMS defines it. Sites delegate their
 * `src/content.config.ts` to this factory with their own editors: the author
 * enum is site configuration, not CMS code, so a new site never edits this file.
 */
export function defineBlogCollection(options: { authors: readonly [string, ...string[]] }) {
  return defineCollection({
    // Load Markdown and MDX files in the site's `src/content/blog/` directory.
    loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
    // Type-check frontmatter using a schema
    schema: ({ image }) =>
      z.object({
        title: z.string(),
        description: z.string().default(""),
        excerpt: z.string().default(""),
        // Transform string to Date object
        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        heroImage: z.optional(z.union([image(), z.string()])),
        draft: z.boolean().default(false),
        author: z.enum(options.authors).default(options.authors[0]),
        template: z.enum(TEMPLATE_IDS).default("default"),
        defaultWidth: z.string().default("60rem"),
        wideWidth: z.string().default("70rem"),
      }),
  });
}
