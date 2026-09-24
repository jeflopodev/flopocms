import * as v from "valibot";

export const amazonProductSchema = v.object({
  title: v.optional(v.string(), "Premium Amazon Product"),
  description: v.optional(v.string()),
  asin: v.optional(v.string()),
  id: v.optional(v.string()),
  image: v.optional(v.any()),
  imageAlt: v.optional(v.string()),
  badge: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  price: v.optional(v.union([v.string(), v.number()]), "29.99"),
  currencySymbol: v.optional(v.string(), "$"),
  originalPrice: v.optional(v.union([v.string(), v.number()])),
  discountText: v.optional(v.string()),
  rating: v.optional(v.number(), 4.5),
  reviewsCount: v.optional(v.union([v.number(), v.string()])),
  amazonUrl: v.optional(v.string()),
  affiliateUrl: v.optional(v.string()),
  ctaText: v.optional(v.string(), "Buy Now on Amazon"),
  detailsUrl: v.optional(v.string()),
  detailsText: v.optional(v.string()),
  imageFit: v.optional(v.picklist(["cover", "contain", "fill", "none"]), "cover"),
  stretch: v.optional(v.string()),
  class: v.optional(v.string()),
  className: v.optional(v.string()),
  style: v.optional(v.union([v.string(), v.record(v.string(), v.any())])),
});

export type AmazonProductProps = v.InferOutput<typeof amazonProductSchema>;
