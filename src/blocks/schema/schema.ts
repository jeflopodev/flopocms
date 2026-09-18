import * as v from "valibot";

export const schemaBlockSchema = v.object({
  type: v.string(),
  data: v.optional(v.record(v.string(), v.any())),
});

export type SchemaBlockProps = v.InferOutput<typeof schemaBlockSchema>;
