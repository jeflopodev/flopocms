import * as v from "valibot";

export const youtubeSchema = v.object({
  id: v.string(),
  title: v.optional(v.string(), "YouTube video player"),
  stretch: v.optional(v.string()),
});

export type YouTubeProps = v.InferOutput<typeof youtubeSchema>;
