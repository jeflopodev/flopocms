import * as v from "valibot";

export const relatedPostsSchema = v.object({
  category: v.optional(v.string()),
  tags: v.optional(v.union([v.array(v.string()), v.string()])),
  limit: v.optional(v.union([v.number(), v.string()]), 3),
  currentSlug: v.optional(v.string()),
  title: v.optional(v.string(), "Related Articles"),
});

export type RelatedPostsProps = v.InferOutput<typeof relatedPostsSchema>;
