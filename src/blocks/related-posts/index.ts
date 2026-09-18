export * from "./schema";

export const relatedPostsBlock = {
  id: "related-posts",
  name: "Related Posts",
  description: "Dynamic D1-queried related articles based on category or tags",
  icon: "book",
  defaultSnippet: `<RelatedPosts category="Astro" limit={3} />`,
};
