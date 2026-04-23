# Sample Advice Pack — Mrs K. Chen, Pension Transfer

Sample PDF documents for uploading into the Copilot Studio test pane (or Teams chat) to exercise the Financial Advice Pack Review agent.

## Files

| #   | File                                                       | Component                  | Size  |
| --- | ---------------------------------------------------------- | -------------------------- | ----- |
| 1   | [01-fact-find.pdf](01-fact-find.pdf)                       | Fact Find                  | ~8 KB |
| 2   | [02-attitude-to-risk.pdf](02-attitude-to-risk.pdf)         | Attitude to Risk           | ~4 KB |
| 3   | [03-suitability-report.pdf](03-suitability-report.pdf)     | Suitability Report         | ~7 KB |
| 4   | [04-costs-and-charges.pdf](04-costs-and-charges.pdf)       | Costs & Charges disclosure | ~5 KB |
| 5   | [05-product-illustration.pdf](05-product-illustration.pdf) | Product Illustration       | ~6 KB |

All five together form a complete document pack for testing.

## Scenario

Mrs Katherine Chen (age 64) is advised to transfer a £145,000 CETV from her deferred Meridian Engineering defined-benefit pension scheme into a new Aviva flexi-access drawdown personal pension, consolidated with an existing £38,400 Aviva personal pension. The adviser has concluded the transfer is suitable given her stated preference for flexibility and inheritance planning, and the fact that her essential household income is already secured by her spouse's DB pension and her State Pension.

The pack is intentionally realistic — well-evidenced on most criteria — but contains deliberate flaws that the agent should flag.

## Expected agent verdict

The pack should produce an overall verdict of **`APPROVE_WITH_CHANGES`** (approximately 80 / 100), matching the sample interaction in [../business-requirements.md](../business-requirements.md).

### Deliberate issues the agent should catch

1. **`DISC-FSCS` — Amber.** The Product Illustration cites the **outdated £75,000** FSCS investment limit. The current limit is **£85,000** (April 2024 onward). The Disclosure Checker should flag this.
2. **`CD-PV-3` / `SP-7` — Amber.** The Costs & Charges document contains a year-1 cost comparison but **no 10-year cumulative projection** as required by firm suitability policy §3.4 for replacement business.
3. **`CD-PV-2` / `CD-PV-4` — Amber.** The Suitability Report's value-for-money statement relies partly on Aviva product literature (&quot;service levels meet industry benchmarks&quot;) rather than a bespoke adviser analysis tailored to this client.
4. **`SP-10` — Amber.** Sustainability / ESG preferences are recorded but the conversation is short (&quot;no strong preference&quot;) without a follow-up discussion of any ESG options offered.
5. **Charging structure — Green with nuance.** The adviser charge is shown in both percentage and cash terms (Green for `DISC-CHARGING`), but the ongoing cancellation mechanism is stated only in the Costs & Charges document, not in the Suitability Report itself.

### Things the pack should do correctly (Green)

- Fact Find is thorough, with client's own-words objectives
- ATR completed and discussed separately from Capacity for Loss
- Capacity for Loss expressed in pounds (not just percentage)
- Existing arrangements listed with values, charges, and features
- Transfer Value Analysis referenced with explicit critical yield (8.2%) and acknowledged shortfall
- Pension Transfer Specialist (Alison Reed, G60) sign-off present
- Cancellation rights correctly stated with 30-day period and market-value reduction warning
- Complaints handling correctly references FOS, 8-week trigger, named contact
- Vulnerability flagged (health driver) with explicit impact analysis on advice
- Adviser and client declarations signed and dated

## How to use

### In the Copilot Studio test pane

1. Publish the agent (or use the test pane without publishing).
2. In the test chat, upload all 5 PDFs. If the test pane only accepts one upload at a time, upload them in sequence and say &quot;here's another file&quot; — the agent should wait until all files are uploaded before starting the pipeline (business requirement item 1).
3. Ask: &quot;Please review this pack for Mrs Chen's pension transfer.&quot;
4. The agent should preprocess the files, run the full pipeline, and return the suitability report as Markdown.

### In Teams

1. Publish the agent to Teams.
2. In a chat with the agent, attach the 5 PDFs.
3. Send the review request message.
4. The agent should return the report inline.

### Partial-pack testing

To test the &quot;incomplete pack&quot; sample interaction (business requirement sample §3), upload only 2 of the 5 files (e.g. Fact Find + ATR, no Suitability Report). The agent should halt and list the missing required components.

### Escalation testing

To test the `ESCALATE` path, modify the Suitability Report PDF to remove the Pension Transfer Specialist sign-off, or regenerate with `build_suitability()` tweaked to remove the `A. Reed` signature line. A transfer pack without PTS sign-off should produce multiple Red verdicts on SP-8 and push the overall verdict to ESCALATE.

## Regenerating the PDFs

If you edit the content or need to regenerate:

```bash
cd sample-pack
python3 generate-pdfs.py
```

Requires Python 3 and `reportlab`:

```bash
pip install reportlab
```

Generation takes under a second. All 5 PDFs overwrite in place.

## Disclaimer

All names, firms, scheme numbers, values, figures, and scenarios in the sample PDFs are **fictional**. The pack is illustrative sample content for testing the agent's assessment behaviour. It is not regulated financial advice and must not be relied on as such.

Before using similar content in production, the firm's compliance officer must sign off on the knowledge base documents and any sample content used in staff training.
