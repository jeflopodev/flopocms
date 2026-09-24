import DefaultTemplate from "./default.astro";
import TwoColumnTemplate from "./two-column.astro";

export const templates = {
  default: DefaultTemplate,
  "two-column": TwoColumnTemplate,
} as const;

export type TemplateId = keyof typeof templates;

export const templateOptions = [
  { id: "default", label: "Default (Single Column)" },
  { id: "two-column", label: "Two Columns (Article | Aside)" },
] as const;

export function getTemplateComponent(templateId?: string) {
  if (templateId === "two-column") {
    return TwoColumnTemplate;
  }
  return DefaultTemplate;
}
