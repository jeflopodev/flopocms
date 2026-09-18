export * from "./schema";

export const listBlock = {
  id: "list",
  name: "Complex List",
  description: "Nested list mixing UL and OL with list-style-type",
  icon: "list",
  defaultSnippet: `<Ul list-style-type="disc">\n  <li>First point</li>\n  <Ol list-style-type="roman">\n    <li>Nested roman point</li>\n  </Ol>\n  <li>Second point</li>\n</Ul>`,
};
