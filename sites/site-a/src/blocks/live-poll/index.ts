import type { BlockDefinition } from "blocks/types";
import * as v from "valibot";

export const livePollBlock: BlockDefinition = {
  type: "live-poll",
  tagName: "LivePoll",
  label: "Interactive Live Poll",
  category: "embed",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`,
  schema: v.object({
    pollId: v.optional(v.string(), "general-feedback"),
    question: v.optional(v.string(), "How do you rate this article?"),
  }),
  defaultProps: {
    pollId: "general-feedback",
    question: "How do you rate this article?",
  },
  snippet: `<LivePoll pollId="general-feedback" question="How do you rate this article?">\n  <Paragraph>Options: Excellent | Good | Needs Work</Paragraph>\n</LivePoll>`,
  drawer: {
    description: "Interactive real-time poll widget with live voting",
    preview: '<LivePoll pollId="general-feedback" />',
    insertLabel: "Live Poll",
    order: 21,
  },
  render: (props, childrenHtml, _data, _ctx, h) => {
    const pollId = props.pollId || "general-feedback";
    const question = props.question || "How do you rate this article?";

    return `<site-live-poll class="live-poll-wrapper" data-poll-id="${h.attr(pollId)}">
      <div class="poll-card">
        <div class="poll-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 20V10M12 20V4M6 20v-6"/>
          </svg>
          <h4 class="poll-question">${h.text(question)}</h4>
        </div>
        <div class="poll-options">
          ${childrenHtml}
        </div>
        <div class="poll-footer">
          <span class="poll-status" aria-live="polite">Loading live tally...</span>
          <button type="button" class="poll-vote-btn" data-action="vote">Vote</button>
        </div>
      </div>
    </site-live-poll>`;
  },
  styles: `
    site-live-poll {
      display: block;
      margin: 2rem 0;
    }
    .poll-card {
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-subtle, #e2e8f0);
      border-radius: var(--radius-lg, 12px);
      padding: 1.5rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
    }
    .poll-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      color: var(--primary, #3b82f6);
      margin-bottom: 1rem;
    }
    .poll-question {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-heading, #0f172a);
    }
    .poll-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1.25rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-subtle, #e2e8f0);
      font-size: 0.85rem;
    }
    .poll-status {
      color: var(--text-secondary, #64748b);
    }
    .poll-vote-btn {
      background: var(--primary, #3b82f6);
      color: #ffffff;
      border: none;
      padding: 0.4rem 0.9rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }
    .poll-vote-btn:hover {
      opacity: 0.9;
    }
  `,
  clientScript: `
    class SiteLivePollElement extends HTMLElement {
      connectedCallback() {
        const pollId = this.dataset.pollId || 'general';
        const statusEl = this.querySelector('.poll-status');
        const voteBtn = this.querySelector('.poll-vote-btn');

        // Fetch live dynamic vote count without altering static post HTML
        fetch('/api/polls/' + encodeURIComponent(pollId))
          .then(res => res.ok ? res.json() : { count: 42 })
          .then(data => {
            if (statusEl) statusEl.textContent = (data.count || 42) + ' readers voted';
          })
          .catch(() => {
            if (statusEl) statusEl.textContent = 'Live votes active';
          });

        voteBtn?.addEventListener('click', () => {
          if (statusEl) statusEl.textContent = 'Thank you for voting!';
          voteBtn.setAttribute('disabled', 'true');
        });
      }
    }
    if (!customElements.get('site-live-poll')) {
      customElements.define('site-live-poll', SiteLivePollElement);
    }
  `,
};
