export * from "./schema";

export const calloutBlock = {
  id: "callout",
  name: "Callout",
  description: "Accessible alert box (note, tip, important, warning, caution)",
  icon: "alert",
  defaultSnippet: `<Callout variant="note">\n  Enter callout explanation here.\n</Callout>`,
};
