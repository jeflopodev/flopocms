-- The editorial record, aliased to the names the Article row mapper already reads.
--
-- One mapping from a `posts` row to an Article exists — `rowToArticle`, which the Live Draft
-- Preview uses. Aliasing here rather than writing a second mapper for the check is what
-- keeps the check honest: it compares the deployed projection against `main` through the
-- same translation both pages use.
SELECT
  id,
  slug,
  title,
  description,
  author,
  category,
  tags,
  featured_image AS featuredImage,
  content_mdx AS contentMdx,
  status,
  template,
  default_width AS defaultWidth,
  wide_width AS wideWidth,
  pub_date AS pubDate,
  created_at AS createdAt,
  updated_at AS updatedAt
FROM posts;
