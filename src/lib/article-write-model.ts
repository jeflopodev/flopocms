import * as v from "valibot";
import type { TemplateId } from "./article";
import type { PostRecord, PostStatus } from "./post-store";

/**
 * Article Write Model.
 *
 * One place through which an Article is written, mirroring the Article Read Model.
 * The shape below is the only declaration of the editable fields: the Article Editor's
 * DOM adapter reads into it, the save route parses into it, and Post Lifecycle maps it to
 * a PostRecord. Previously the same field set was written out four times — twice in the
 * editor client, once in Post Lifecycle and once in the Post Store — with two different
 * spellings, so a field missed in one copy arrived as `undefined` and the store's default
 * silently took its place.
 *
 * The spelling is the wire's: snake_case for the fields the editor has always sent, which
 * are also the D1 column names. `toPostRecord` is the one place the two spellings meet.
 */

export const POST_STATUSES = ["draft", "published"] as const;
export const TEMPLATE_IDS = ["default", "two-column"] as const;

export const ArticleWriteModelSchema = v.object({
  id: v.pipe(v.string(), v.nonEmpty("id is required")),
  slug: v.pipe(v.string(), v.nonEmpty("slug is required")),
  title: v.pipe(v.string(), v.nonEmpty("title is required")),
  description: v.optional(v.string(), ""),
  category: v.optional(v.string(), "General"),
  tags: v.optional(v.array(v.string()), []),
  /** Resolved against the actor by Post Lifecycle when absent. */
  author: v.optional(v.string()),
  featured_image: v.optional(v.string(), ""),
  content_mdx: v.optional(v.string(), ""),
  status: v.optional(v.picklist(POST_STATUSES), "draft"),
  template: v.optional(v.picklist(TEMPLATE_IDS), "default"),
  default_width: v.optional(v.string(), "60rem"),
  wide_width: v.optional(v.string(), "70rem"),
  /** Absent or empty means "not published yet"; Post Lifecycle stamps the save time. */
  pub_date: v.optional(v.string()),
});

export type ArticleWriteModel = v.InferOutput<typeof ArticleWriteModelSchema>;

/**
 * What the Settings Panel owns. The body comes from CodeMirror and the status from the
 * Editor Session, so both are excluded: the editor composes the write model from three
 * sources and cannot quietly omit one of them.
 */
export type EditableArticleFields = Omit<ArticleWriteModel, "id" | "content_mdx" | "status">;

export type ParsedArticleWriteModel =
  | { ok: true; model: ArticleWriteModel }
  | { ok: false; error: string };

/** Names the offending field, so a malformed request says which one it was. */
function describeIssues(issues: readonly v.BaseIssue<unknown>[]): string {
  return issues
    .map((issue) => {
      const path = (issue.path ?? [])
        .map((segment) => String((segment as { key?: PropertyKey }).key ?? ""))
        .filter(Boolean)
        .join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/**
 * An incoming Article, with every field the schema defines filled in.
 *
 * Untrusted input in, a write model out — or the reason it is not one.
 */
export function articleWriteModel(input: unknown): ParsedArticleWriteModel {
  const parsed = v.safeParse(ArticleWriteModelSchema, input);
  if (parsed.success) return { ok: true, model: parsed.output };

  return { ok: false, error: describeIssues(parsed.issues) || "Invalid article payload" };
}

/**
 * The editorial record a write model describes.
 *
 * `createdAt` is preserved from the stored record and `updatedAt` is the save time, so a
 * caller cannot accidentally reset either; `pub_date` falls back to the save time only
 * when the Article has none.
 */
export function toPostRecord(
  model: ArticleWriteModel,
  options: { existing?: PostRecord | null; now: string; author: string }
): PostRecord {
  return {
    id: model.id,
    slug: model.slug.trim().toLowerCase(),
    title: model.title,
    description: model.description,
    category: model.category,
    tags: JSON.stringify(model.tags),
    author: options.author,
    featuredImage: model.featured_image,
    contentMdx: model.content_mdx,
    status: model.status as PostStatus,
    template: model.template as TemplateId,
    defaultWidth: model.default_width,
    wideWidth: model.wide_width,
    pubDate: model.pub_date || options.now,
    createdAt: options.existing?.createdAt ?? options.now,
    updatedAt: options.now,
  };
}
