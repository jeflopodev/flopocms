import * as v from "valibot";

export const listItemSchema = v.object({});

export type ListItemProps = v.InferOutput<typeof listItemSchema>;
