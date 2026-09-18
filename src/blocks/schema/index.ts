export * from "./schema";

export const schemaBlock = {
  id: "schema",
  name: "Schema (JSON-LD)",
  description: "Structured FAQ / Article JSON-LD entity",
  icon: "code",
  defaultSnippet: `<Schema type="FAQPage">\n  {JSON.stringify({\n    "@context": "https://schema.org",\n    "@type": "FAQPage",\n    "mainEntity": [\n      {\n        "@type": "Question",\n        "name": "What is Astro?",\n        "acceptedAnswer": {\n          "@type": "Answer",\n          "text": "Astro is the web framework for content-driven websites."\n        }\n      }\n    ]\n  })}\n</Schema>`,
};
