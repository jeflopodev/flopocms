import type { BlockDefinition } from "../types";
import { youtubeSchema, type YouTubeProps } from "./schema";

export * from "./schema";

export const youtubeBlock: BlockDefinition<YouTubeProps> = {
  type: "youtube",
  tagName: "YouTube",
  label: "YouTube Video",
  category: "media",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>`,
  schema: youtubeSchema,
  supportsStretch: true,
  defaultProps: { title: "YouTube video player", stretch: "wide" },
  snippet: `<YouTube id="dQw4w9WgXcQ" title="Video Title" stretch="wide" />`,
  generateJsonLd: (props) => {
    if (!props.id) return null;
    return {
      "@type": "VideoObject",
      "@id": `#video-${props.id}`,
      name: props.title || "Embedded YouTube Video",
      thumbnailUrl: `https://img.youtube.com/vi/${props.id}/hqdefault.jpg`,
      embedUrl: `https://www.youtube.com/embed/${props.id}`,
    };
  },
  render: (props) => {
    const stretch = props.stretch || "default";
    const isCustom = stretch && stretch !== "wide" && stretch !== "full" && stretch !== "default";
    const customStyle = isCustom ? ` style="--stretch-width: ${stretch};"` : "";

    return `<div class="youtube-container" data-stretch="${stretch}"${customStyle}>
      <iframe
        src="https://www.youtube-nocookie.com/embed/${props.id}"
        title="${props.title || "YouTube video player"}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        loading="lazy"
      ></iframe>
    </div>`;
  },
  styles: `
    .youtube-container {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      margin: 2rem 0;
      border-radius: 0.75rem;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
      box-sizing: border-box;
    }
    .youtube-container[data-stretch="full"] {
      border-radius: 0;
    }
    .youtube-container iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }
  `,
};
