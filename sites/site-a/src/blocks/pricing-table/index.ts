import type { BlockDefinition } from "blocks/types";
import * as v from "valibot";

export interface PricingPlanData {
  priceMonthly: number;
  period: string;
}

export const pricingTableBlock: BlockDefinition<any, PricingPlanData> = {
  type: "pricing-table",
  tagName: "PricingTable",
  label: "Pricing Table",
  category: "commerce",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  schema: v.object({
    tier: v.optional(v.picklist(["starter", "pro", "enterprise"]), "starter"),
    highlight: v.optional(v.boolean(), false),
  }),
  defaultProps: { tier: "pro", highlight: false },
  snippet: `<PricingTable tier="pro">\n  <Paragraph>Includes unlimited deployments and real-time analytics.</Paragraph>\n</PricingTable>`,
  drawer: {
    description: "Dynamic product tier and pricing card",
    preview: '<PricingTable tier="pro" />',
    insertLabel: "Pricing Card",
    order: 20,
  },
  toolbar: [
    {
      id: "pricing-table-btn",
      title: "Pricing Table",
      bodyHtml: "<span>$</span>",
      snippet: `<PricingTable tier="pro">\n  <Paragraph>Includes unlimited deployments.</Paragraph>\n</PricingTable>`,
      group: "insert",
      order: 110,
    },
  ],
  loadServerData: async (props) => {
    // Dynamic data resolved at build time (e.g. from local API, mock, or live service)
    const tier = props.tier || "starter";
    const prices: Record<string, number> = { starter: 0, pro: 29, enterprise: 99 };
    return {
      priceMonthly: prices[tier] ?? 19,
      period: "monthly",
    };
  },
  render: (props, childrenHtml, data, _ctx, h) => {
    const tier = props.tier || "starter";
    const price = data?.priceMonthly ?? 0;
    const isHighlight = props.highlight ? " highlight" : "";

    return `<div class="pricing-card${isHighlight}" data-tier="${h.attr(tier)}">
      <div class="pricing-badge">${h.text(tier.toUpperCase())}</div>
      <div class="pricing-amount">
        <span class="currency">$</span>
        <span class="value">${h.text(String(price))}</span>
        <span class="period">/mo</span>
      </div>
      <div class="pricing-features">
        ${childrenHtml}
      </div>
    </div>`;
  },
  styles: `
    .pricing-card {
      border: 1px solid var(--border-subtle, #e2e8f0);
      border-radius: var(--radius-lg, 12px);
      padding: 1.75rem;
      margin: 2rem 0;
      background: var(--bg-surface, #ffffff);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .pricing-card.highlight {
      border-color: #6366f1;
      box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.12);
    }
    .pricing-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #6366f1;
      background: rgba(99, 102, 241, 0.1);
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      margin-bottom: 0.75rem;
    }
    .pricing-amount {
      display: flex;
      align-items: baseline;
      gap: 0.2rem;
      font-size: 2.25rem;
      font-weight: 800;
      color: var(--text-heading, #0f172a);
      margin-bottom: 1rem;
    }
    .pricing-amount .currency {
      font-size: 1.4rem;
    }
    .pricing-amount .period {
      font-size: 0.9rem;
      color: var(--text-secondary, #64748b);
      font-weight: 500;
    }
    .pricing-features {
      font-size: 0.95rem;
      color: var(--text-body, #334155);
      line-height: 1.6;
    }
  `,
};
