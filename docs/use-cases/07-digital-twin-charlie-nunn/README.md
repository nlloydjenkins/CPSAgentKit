# Use Case 7 — Digital Twin: Charlie Nunn (Lloyds Banking Group CEO)

This folder contains a **digital twin** use case grounded in publicly available material about **Charlie Nunn**, Group Chief Executive of Lloyds Banking Group (since August 2021). The agent is a **persona-grounding** assistant — it helps a Chief of Staff or executive support team draft communications, prep briefings, and stress-test messaging in Mr Nunn's documented public style, **without impersonating him or making commitments on his behalf**.

## Files

- [business-requirements.md](business-requirements.md) — the use case requirements
- **Knowledge base documents** (persona grounding — uploaded directly to Copilot Studio):
  - [knowledge/biography-and-career.md](knowledge/biography-and-career.md) — career timeline and verifiable factual context → factual grounding
  - [knowledge/communication-style-guide.md](knowledge/communication-style-guide.md) — tone, structure, vocabulary, metaphors → drafting tool
  - [knowledge/leadership-principles-and-purpose.md](knowledge/leadership-principles-and-purpose.md) — purpose-led framing, decision criteria → reasoning frame
  - [knowledge/strategic-priorities-and-positions.md](knowledge/strategic-priorities-and-positions.md) — publicly stated strategic themes and advice → topic grounding
  - [knowledge/signature-quotes-and-examples.md](knowledge/signature-quotes-and-examples.md) — verbatim quotes for style calibration → examples
  - [knowledge/red-lines-and-escalation.md](knowledge/red-lines-and-escalation.md) — what the twin must refuse, escalate, or caveat → policy constraint

## How to use

1. Copy the entire folder contents into a fresh workspace's `Requirements/docs/` folder.
2. Upload the six `knowledge/*.md` files **directly to Copilot Studio** as the agent's knowledge sources (do not stage via SharePoint).
3. Run **Agent Workbench: Create Plan** — the knowledge documents will be listed in `spec.md` and `architecture.md` as persona-grounding sources.
4. Run **Agent Workbench: Build Agent** to generate the agent instructions, knowledge descriptions, and red-line guardrails.

## Knowledge document conventions

All documents follow the same structure so the agent can cite them reliably:

- Version stamp and scope at the top of every file
- Numbered items with stable IDs (e.g. `BIO-3`, `STYLE-T-2`, `PRIN-1`, `POS-DIGITAL-3`, `QUOTE-7`, `REDLINE-4`) the agent quotes verbatim in drafts and audit logs
- Source attribution after every claim (publicly cited material only)
- "Use this for / Do not use this for" guidance in the file header to support generative orchestration
- "What good looks like" / "What fails" examples on the style and red-lines documents

## Ethical and authority disclaimer

This use case is built **exclusively from public sources** (press releases, official Lloyds Banking Group communications, published interviews, conference remarks). It contains **no psychological profiling, no private information, and no inferred views**.

The agent:

- **Is not** Charlie Nunn and must never claim to be him.
- **Must not** make commitments, approvals, promises, policy decisions, employment decisions, legal statements, financial commitments, regulatory positions, or personal claims on his behalf.
- **Must not** invent views on topics not present in the knowledge base.
- **Must escalate** any externally bound output (press, regulator, board, customer, employee comms) to an authorised human reviewer before release.

Before any production deployment, an authorised Lloyds Banking Group representative — and Mr Nunn himself or his delegated office — **must review, correct, and approve** the persona knowledge base and the agent's red-line policy. The pattern below is illustrative of how to build a public-figure digital twin responsibly; it is not an endorsed product.

## Sample organisational defaults

The business requirements include sample team names, mailbox names, Teams channel names, and Dataverse prefixes. Treat these as build-time configuration defaults. During Build, Agent Workbench should ask the maker to confirm or replace tenant-specific values before finalising tenant-bound schema names, knowledge upload targets, or prompt instructions.
