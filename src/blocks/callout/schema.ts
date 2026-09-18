import * as v from "valibot";

export const CalloutVariantSchema = v.picklist([
  "note",
  "tip",
  "important",
  "warning",
  "caution",
]);

export const calloutSchema = v.object({
  variant: v.optional(CalloutVariantSchema, "note"),
  title: v.optional(v.string()),
  class: v.optional(v.string()),
});

export type CalloutProps = v.InferOutput<typeof calloutSchema>;
