export * from "./schema";

export const amazonProductBlock = {
  id: "amazon",
  name: "Amazon Product",
  description: "Interactive showcase card for affiliate Amazon products",
  icon: "shopping-bag",
  defaultSnippet: `<AmazonProduct\n  asin="B08N5WRWNW"\n  title="Product Name"\n  price="$29.99"\n  rating={4.5}\n  image="/uploads/product.webp"\n/>`,
};
