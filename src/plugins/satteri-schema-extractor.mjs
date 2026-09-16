/**
 * Safely parses JSX attribute values (strings, numbers, booleans, objects, arrays).
 */
function parseAttributeValue(attr) {
  if (!attr) return undefined;
  if (attr.value === null || attr.value === undefined) {
    return true; // Boolean flag: e.g. <Component enabled />
  }
  if (typeof attr.value === "string") {
    return attr.value;
  }
  if (attr.value.type === "mdxJsxAttributeValueExpression") {
    const raw = attr.value.value?.trim();
    if (!raw) return undefined;

    // Fast-path primitives
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null") return null;
    if (!isNaN(Number(raw))) return Number(raw);

    // Safely evaluate simple array or object literals
    try {
      return Function(`"use strict"; return (${raw});`)();
    } catch {
      return raw;
    }
  }
  return attr.value;
}

/**
 * Extracts a map of props from a JSX node's attributes array.
 */
function extractProps(node) {
  const props = {};
  if (!Array.isArray(node.attributes)) return props;

  for (const attr of node.attributes) {
    if (attr.type === "mdxJsxAttribute" && attr.name) {
      props[attr.name] = parseAttributeValue(attr);
    }
  }
  return props;
}

/**
 * Sätteri MDAST plugin that extracts structured data from embedded MDX components
 * (<AmazonProduct>, <YouTube>, <Schema>) and attaches a unified JSON-LD @graph
 * to the document's compiled frontmatter.
 */
export function satteriSchemaExtractor() {
  return {
    name: "satteri-schema-extractor",

    mdxJsxFlowElement(node, ctx) {
      processJsxNode(node, ctx);
    },

    mdxJsxTextElement(node, ctx) {
      processJsxNode(node, ctx);
    },

    after(root, ctx) {
      const astro = ctx.data?.astro;
      if (!astro) return;

      const frontmatter = astro.frontmatter || {};
      const entities = ctx.data.__extractedSchemas || [];

      // Base BlogPosting entity
      const articleId = frontmatter.slug ? `#article-${frontmatter.slug}` : "#article";
      const blogPosting = {
        "@type": "BlogPosting",
        "@id": articleId,
        headline: frontmatter.title || "",
        description: frontmatter.description || "",
        datePublished: frontmatter.pubDate ? new Date(frontmatter.pubDate).toISOString() : undefined,
        dateModified: frontmatter.updatedDate
          ? new Date(frontmatter.updatedDate).toISOString()
          : frontmatter.pubDate
          ? new Date(frontmatter.pubDate).toISOString()
          : undefined,
        author: {
          "@type": "Person",
          name: frontmatter.author || "jeflopo",
        },
      };

      if (entities.length > 0) {
        blogPosting.mentions = entities
          .filter((e) => e["@id"])
          .map((e) => ({ "@id": e["@id"] }));
      }

      // Assemble unified @graph
      const graph = [blogPosting, ...entities];

      astro.frontmatter.jsonLd = {
        "@context": "https://schema.org",
        "@graph": graph,
      };
    },
  };
}

function processJsxNode(node, ctx) {
  if (!node.name) return;

  if (!ctx.data.__extractedSchemas) {
    ctx.data.__extractedSchemas = [];
  }

  const props = extractProps(node);

  if (node.name === "AmazonProduct" || node.name === "ProductCard" || node.name === "Product") {
    const asin = props.asin || props.id;
    const title = props.title || props.productName || "Product";
    const productId = asin ? `#product-${asin}` : `#product-${ctx.data.__extractedSchemas.length + 1}`;

    const productSchema = {
      "@type": "Product",
      "@id": productId,
      name: title,
      sku: asin || undefined,
      image: props.image ? (typeof props.image === "string" ? props.image : props.image.src) : undefined,
    };

    if (props.price) {
      const cleanPrice = typeof props.price === "string" ? props.price.replace(/[^0-9.]/g, "") : props.price;
      productSchema.offers = {
        "@type": "Offer",
        price: cleanPrice,
        priceCurrency: props.currency || "USD",
        availability: "https://schema.org/InStock",
        url: props.affiliateUrl || props.href || (asin ? `https://www.amazon.com/dp/${asin}` : undefined),
      };
    }

    if (props.rating) {
      productSchema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: Number(props.rating),
        reviewCount: Number(props.ratingCount || props.reviewsCount || 1),
      };
    }

    if (props.pros || props.cons) {
      productSchema.review = {
        "@type": "Review",
        reviewRating: {
          "@type": "Rating",
          ratingValue: Number(props.rating || 5),
        },
        positiveNotes: Array.isArray(props.pros) ? { "@type": "ItemList", itemListElement: props.pros } : undefined,
        negativeNotes: Array.isArray(props.cons) ? { "@type": "ItemList", itemListElement: props.cons } : undefined,
      };
    }

    ctx.data.__extractedSchemas.push(productSchema);
  } else if (node.name === "YouTube" || node.name === "YouTubeEmbed") {
    const id = props.id;
    if (id) {
      const videoId = `#video-${id}`;
      ctx.data.__extractedSchemas.push({
        "@type": "VideoObject",
        "@id": videoId,
        name: props.title || "Embedded YouTube Video",
        thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        embedUrl: `https://www.youtube.com/embed/${id}`,
      });
    }
  } else if (node.name === "Schema") {
    if (props.type && props.data) {
      const schemaData = typeof props.data === "object" ? props.data : {};
      ctx.data.__extractedSchemas.push({
        "@type": props.type,
        ...schemaData,
      });
    }
  }
}
