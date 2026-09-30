import type { BlockDefinition } from "#/types";
import { amazonProductSchema, type AmazonProductProps } from "./schema";

export * from "./schema";

export const amazonProductBlock: BlockDefinition<AmazonProductProps> = {
  type: "amazon-product",
  tagName: "AmazonProduct",
  label: "Amazon Product",
  category: "commerce",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  schema: amazonProductSchema,
  supportsStretch: true,
  defaultProps: {
    title: "Product Name",
    price: "29.99",
    currencySymbol: "$",
    rating: 4.5,
    ctaText: "Buy on Amazon",
    stretch: "default",
  },
  drawer: {
    description: "Product showcase with global assets",
    preview: '<AmazonProduct asin="B0..." price="$..." image="/uploads/..." />',
    insertLabel: "Product Block",
    order: 3,
  },
  snippet: `<AmazonProduct
  asin="B08N5WRWNW"
  title="Product Name"
  price="$29.99"
  rating={4.5}
  image="/uploads/product.webp"
  ctaText="Buy on Amazon"
/>`,
  generateJsonLd: (props) => {
    const asin = props.asin || props.id;
    const title = props.title || "Product";
    const productId = asin ? `#product-${asin}` : undefined;

    const productSchema: any = {
      "@type": "Product",
      ...(productId ? { "@id": productId } : {}),
      name: title,
      sku: asin || undefined,
      image: typeof props.image === "string" ? props.image : undefined,
    };

    if (props.price) {
      const cleanPrice = typeof props.price === "string" ? props.price.replace(/[^0-9.]/g, "") : String(props.price);
      productSchema.offers = {
        "@type": "Offer",
        price: cleanPrice,
        priceCurrency: props.currencySymbol === "€" ? "EUR" : "USD",
        availability: "https://schema.org/InStock",
        url: props.affiliateUrl || props.amazonUrl || (asin ? `https://www.amazon.com/dp/${asin}` : undefined),
      };
    }

    if (props.rating) {
      productSchema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: Number(props.rating),
        reviewCount: Number(props.reviewsCount || 1),
      };
    }

    return productSchema;
  },
  render: (props, _childrenHtml, _data, _ctx, h) => {
    const title = props.title || "Amazon Product";
    const price = props.price ? String(props.price) : "";
    const currency = props.currencySymbol || "$";
    const image = typeof props.image === "string" ? props.image : "";
    const ctaText = props.ctaText || "Buy on Amazon";
    const asin = props.asin || props.id;
    const amazonUrl = props.affiliateUrl || props.amazonUrl || (asin ? `https://www.amazon.com/dp/${asin}` : "#");
    const stretch = props.stretch || "default";
    const rating = props.rating ? Number(props.rating) : null;

    return `<div class="amazon-preview-box" data-stretch="${h.attr(stretch)}">
      ${image ? `<img src="${h.attr(image)}" alt="${h.attr(title)}" class="amazon-preview-img" loading="lazy" />` : ""}
      <div class="amazon-preview-info">
        <h4 class="amazon-preview-title">${h.text(title)}</h4>
        ${rating ? `<div class="amazon-preview-rating">★ ${h.text(rating.toFixed(1))} / 5</div>` : ""}
        ${price ? `<div class="amazon-preview-price">${h.text(price.startsWith("$") || price.startsWith("€") ? price : `${currency}${price}`)}</div>` : ""}
        <a href="${h.attr(amazonUrl)}" target="_blank" rel="noopener noreferrer nofollow" class="amazon-preview-btn">${h.text(ctaText)}</a>
      </div>
    </div>`;
  },
  styles: `
    .amazon-preview-box {
      display: flex;
      gap: 1.5rem;
      padding: 1.25rem;
      border: 1px solid var(--border-subtle, #e2e8f0);
      border-radius: 12px;
      background: var(--bg-surface, #ffffff);
      margin: 2rem 0;
      align-items: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      box-sizing: border-box;
      width: 100%;
    }
    .amazon-preview-img {
      width: 120px;
      height: 120px;
      object-fit: contain;
      border-radius: 8px;
      background: #f8fafc;
      padding: 0.5rem;
      flex-shrink: 0;
    }
    .amazon-preview-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .amazon-preview-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-heading, #0f172a);
    }
    .amazon-preview-rating {
      font-size: 0.85rem;
      font-weight: 600;
      color: #f59e0b;
    }
    .amazon-preview-price {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--primary, #3b82f6);
    }
    .amazon-preview-btn {
      display: inline-block;
      width: fit-content;
      padding: 0.5rem 1.2rem;
      background: #f59e0b;
      color: #1e293b;
      font-weight: 700;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.88rem;
      transition: background 0.15s ease;
    }
    .amazon-preview-btn:hover {
      background: #d97706;
    }
  `,
};
