import * as v from "valibot";

export const listSchema = v.object({
  type: v.optional(v.picklist(["unordered", "ordered"]), "unordered"),
  listStyle: v.optional(v.string()),
  start: v.optional(v.union([v.number(), v.string()])),
});

export type ListProps = v.InferOutput<typeof listSchema>;

export const ListStyleTypeSchema = v.string();

export const ulSchema = v.object({
  "list-style-type": v.optional(ListStyleTypeSchema, "disc"),
  listStyleType: v.optional(ListStyleTypeSchema),
  class: v.optional(v.string()),
  style: v.optional(v.string()),
});

export const olSchema = v.object({
  "list-style-type": v.optional(ListStyleTypeSchema, "decimal"),
  listStyleType: v.optional(ListStyleTypeSchema),
  start: v.optional(v.union([v.number(), v.string()])),
  reversed: v.optional(v.boolean()),
  class: v.optional(v.string()),
  style: v.optional(v.string()),
});

export type UlProps = v.InferOutput<typeof ulSchema>;
export type OlProps = v.InferOutput<typeof olSchema>;

export function normalizeListStyleType(type?: string): string {
  if (!type) return "initial";
  const t = type.toLowerCase().trim();
  if (t === "roman") return "lower-roman";
  if (t === "alpha") return "lower-alpha";
  return t;
}

