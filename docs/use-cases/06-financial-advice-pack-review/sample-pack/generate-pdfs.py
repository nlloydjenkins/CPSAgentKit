#!/usr/bin/env python3
"""
Generate sample Helios Wealth Management advice pack PDFs for use case 6
(Financial Advice Pack Review) test pane uploads.

Produces 5 PDFs for a fictional client, Mrs K. Chen, recommending a
defined-benefit to defined-contribution pension transfer. The pack is
intentionally imperfect so the agent has realistic issues to flag:
  - FSCS disclosure cites the outdated £75,000 investments limit
  - Cost comparison lacks a 10-year projection required by firm policy
  - Sustainability preferences only lightly documented
  - Consumer Duty "Price & Value" evidence relies on product literature

All names, firms, scheme numbers, values, signatures and scenarios are
fictional. This is sample content for testing only and is not regulated
financial advice.

Usage:
    python3 generate-pdfs.py

Produces 5 PDFs in the same directory as this script.
"""

from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT_DIR = Path(__file__).parent
CLIENT = "Mrs Katherine Chen"
CLIENT_SHORT = "Mrs K. Chen"
ADVISER = "John Smith, DipPFS"
FIRM = "Helios Wealth Management Ltd"
FIRM_REG = "FCA FRN 123456"
PACK_DATE = "14 March 2026"


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="DocTitle",
        parent=styles["Title"],
        fontSize=18,
        spaceAfter=12,
        textColor=colors.HexColor("#1b3a5c"),
    )
)
styles.add(
    ParagraphStyle(
        name="SectionHeader",
        parent=styles["Heading2"],
        fontSize=12,
        spaceBefore=14,
        spaceAfter=6,
        textColor=colors.HexColor("#1b3a5c"),
    )
)
styles.add(
    ParagraphStyle(
        name="SubHeader",
        parent=styles["Heading3"],
        fontSize=10.5,
        spaceBefore=10,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="Body",
        parent=styles["BodyText"],
        fontSize=10,
        leading=14,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="Small",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#555555"),
    )
)
styles.add(
    ParagraphStyle(
        name="Signature",
        parent=styles["BodyText"],
        fontSize=10,
        leading=14,
        spaceBefore=24,
    )
)


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#555555"))
    canvas.drawString(
        2 * cm, 28 * cm, f"{FIRM} — {FIRM_REG} — Confidential"
    )
    canvas.drawString(2 * cm, 1.2 * cm, f"Client: {CLIENT} — Pack date: {PACK_DATE}")
    canvas.drawRightString(19 * cm, 1.2 * cm, f"Page {doc.page}")
    canvas.restoreState()


def build_doc(filename: str) -> BaseDocTemplate:
    doc = BaseDocTemplate(
        str(OUTPUT_DIR / filename),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.4 * cm,
        bottomMargin=2 * cm,
        title=filename.replace(".pdf", ""),
        author=FIRM,
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        id="normal",
    )
    doc.addPageTemplates([PageTemplate(id="default", frames=frame, onPage=header_footer)])
    return doc


def p(text, style="Body"):
    return Paragraph(text, styles[style])


def table(data, col_widths=None, header=True):
    t = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
        ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6eef7")))
        style.append(("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9))
    t.setStyle(TableStyle(style))
    return t


# ---------------------------------------------------------------------------
# Document 1 — Fact Find
# ---------------------------------------------------------------------------

def build_fact_find():
    story = []
    story.append(p("Fact Find", "DocTitle"))
    story.append(p(
        f"Client: <b>{CLIENT}</b> &nbsp;&nbsp; Adviser: <b>{ADVISER}</b> &nbsp;&nbsp; Meeting date: 14 March 2026",
        "Body",
    ))

    story.append(p("1. Personal Details", "SectionHeader"))
    story.append(table([
        ["Field", "Detail"],
        ["Full name", "Katherine Louise Chen"],
        ["Date of birth", "04 July 1961 (age 64)"],
        ["Marital status", "Married (spouse: Robert Chen, age 66, retired)"],
        ["Dependants", "None financially dependent"],
        ["Address", "14 Meadow Lane, Farnham, Surrey, GU9 8QN"],
        ["Contact", "k.chen@examplemail.co.uk / 07700 900042"],
        ["Employment", "Self-employed consultant (part-time, winding down)"],
        ["Gross annual income", "£32,000 (approx., declining)"],
        ["State Pension", "Receiving new State Pension £221.20/week"],
        ["Health", "Generally good. Osteoarthritis diagnosed 2023, managed with medication."],
    ], col_widths=[4.5 * cm, 12 * cm]))

    story.append(p("2. Client Objectives (client's own words, recorded in the meeting)", "SectionHeader"))
    story.append(p(
        "&quot;I want flexibility over how I take my pension — I don't need a fixed income for life, "
        "my husband has a good DB pension and we have some savings. I'd rather have control, "
        "maybe leave what's left to our nieces, and be able to take lump sums for travel in the "
        "next 5 years while we're still well enough to go. I understand I'd be giving up the "
        "guaranteed pension from my old employer's scheme — I've thought about it and the "
        "flexibility is worth more to me than the guarantee.&quot;",
        "Body",
    ))
    story.append(table([
        ["Objective", "Time horizon", "Priority"],
        ["Flexibility to take variable withdrawals", "Immediate — 15+ years", "High"],
        ["Lump sums for travel in next 5 years", "1–5 years", "High"],
        ["Leave residual fund to nieces on death", "Long term", "Medium"],
        ["Replace guaranteed DB income", "Not a priority — covered by husband's DB + State", "Low"],
    ], col_widths=[8 * cm, 5 * cm, 3.5 * cm]))

    story.append(p("3. Existing Arrangements", "SectionHeader"))
    story.append(table([
        ["Provider", "Type", "Value / Benefit", "Date valued"],
        ["Meridian Engineering Pension Scheme", "Defined Benefit (deferred)", "CETV £145,000 / £4,200 pa at 65, 3% escalation, 50% spouse", "28 Feb 2026"],
        ["Aviva Personal Pension", "DC — existing", "£38,400", "28 Feb 2026"],
        ["NS&amp;I Premium Bonds", "Cash", "£22,000", "28 Feb 2026"],
        ["Joint Current Account", "Cash (spouse joint)", "£18,500", "28 Feb 2026"],
        ["Stocks &amp; Shares ISA", "Investment", "£41,200", "28 Feb 2026"],
        ["State Pension", "Statutory", "£221.20/week in payment", "—"],
        ["Spouse DB Pension", "Statutory income to household", "£28,400 pa escalating", "—"],
    ], col_widths=[5.5 * cm, 3.5 * cm, 5.5 * cm, 2 * cm]))
    story.append(p(
        "<i>Notes on existing arrangements:</i> The Meridian DB scheme is closed to future accrual. "
        "Cash emergency fund of £22,000 deemed adequate by client. ISA is actively invested (medium risk). "
        "Client's total household pension income (spouse DB + her State Pension + her State Pension) is "
        "£43,900 per annum, against household essential outgoings of £26,400.",
        "Body",
    ))

    story.append(p("4. Risk Capacity and Loss Capacity", "SectionHeader"))
    story.append(p(
        "<b>4.1 Attitude to Risk:</b> Client completed the firm's ATR questionnaire on 14 March 2026 "
        "(result: Moderate — see separate ATR document). Client agreed the result matched her own view. "
        "Client described her risk attitude as: &quot;I don't want to lose a lot, but I'm not trying to "
        "get rich either — I've got enough, I just want to keep up with inflation and have flexibility.&quot;",
        "Body",
    ))
    story.append(p(
        "<b>4.2 Capacity for Loss (monetary):</b> On the proposed £183,400 combined DC pension pot "
        "(£145,000 transferred + existing £38,400), client stated she could absorb a short-term loss "
        "of up to £36,680 (20%) without altering her retirement plans. A loss of £55,000+ would cause "
        "her to reduce planned travel spending. Her capacity for loss is supported by her spouse's "
        "DB income, State Pension, cash reserves, and ISA. This capacity for loss analysis is recorded "
        "separately from her ATR per firm policy criterion SP-3.",
        "Body",
    ))
    story.append(p(
        "<b>4.3 Experience and Knowledge:</b> Client has held a Stocks &amp; Shares ISA for 18 years, "
        "actively invested. She understands the difference between DB and DC pensions having discussed "
        "it at the first meeting. Reasonable-reader test applied — client confirmed she understands "
        "that DC pensions can fall in value and that there is no guaranteed income for life.",
        "Body",
    ))

    story.append(p("5. Affordability", "SectionHeader"))
    story.append(p(
        "Household income: £43,900 pa (guaranteed sources only). Essential outgoings: £26,400 pa. "
        "Surplus: £17,500 pa before discretionary spending. The recommendation does not require "
        "further client contributions. Planned drawdown of up to £15,000 pa in years 1–5 is "
        "affordable without impacting essential spending even if markets fall 25%.",
        "Body",
    ))

    story.append(p("6. DB Transfer Considerations (specific to this recommendation)", "SectionHeader"))
    story.append(p(
        "Client understands that transferring out of the Meridian DB scheme means:",
        "Body",
    ))
    story.append(p(
        "&bull; Losing the guaranteed £4,200 pa income at 65 (escalating 3%) and the 50% spouse's "
        "pension of £2,100 pa.<br/>"
        "&bull; Taking on investment risk on the £145,000 transferred value.<br/>"
        "&bull; The transfer is generally irreversible.<br/>"
        "&bull; Critical yield required to match scheme benefits: 8.2% per annum (see TVA document).<br/>"
        "&bull; The recommended growth assumption for the new arrangement is 4.5% per annum — a shortfall "
        "she has acknowledged.",
        "Body",
    ))
    story.append(p(
        "Client prioritises flexibility and inheritance over the guaranteed income. Her husband's DB "
        "pension (£28,400 pa escalating) provides household income security independent of her decision. "
        "This rationale is central to the recommendation.",
        "Body",
    ))

    story.append(p("7. Sustainability / ESG Preferences", "SectionHeader"))
    story.append(p(
        "Client was asked about preferences for sustainable / ESG-aligned investments. She stated she "
        "had &quot;no strong preference&quot; and asked the adviser to recommend appropriately. No "
        "specific ESG exclusions were requested.",
        "Body",
    ))

    story.append(p("8. Vulnerability Assessment", "SectionHeader"))
    story.append(p(
        "Client identified as <b>potentially vulnerable</b> under the health driver (osteoarthritis, "
        "managed). Impact on advice: none — cognitive capacity unaffected, client actively engaged, "
        "no evidence of undue third-party influence. Flagged in case of future deterioration; "
        "recommendation is unchanged.",
        "Body",
    ))

    story.append(p(
        "<b>Signed (adviser):</b> J. Smith &nbsp;&nbsp; <b>Date:</b> 14 March 2026",
        "Signature",
    ))
    story.append(p(
        "<b>Signed (client):</b> K. Chen &nbsp;&nbsp; <b>Date:</b> 14 March 2026",
        "Signature",
    ))

    doc = build_doc("01-fact-find.pdf")
    doc.build(story)


# ---------------------------------------------------------------------------
# Document 2 — Attitude to Risk Assessment
# ---------------------------------------------------------------------------

def build_atr():
    story = []
    story.append(p("Attitude to Risk Assessment", "DocTitle"))
    story.append(p(
        f"Client: <b>{CLIENT}</b> &nbsp;&nbsp; Adviser: <b>{ADVISER}</b> &nbsp;&nbsp; "
        f"Assessment date: 14 March 2026 &nbsp;&nbsp; Questionnaire: FinaMetrica v9.2",
        "Body",
    ))

    story.append(p("1. Questionnaire Result", "SectionHeader"))
    story.append(p(
        "Score: <b>54 / 100</b>. Category: <b>Moderate (3 of 5)</b>. "
        "Result valid for 12 months to 14 March 2027.",
        "Body",
    ))
    story.append(p(
        "A Moderate risk profile is willing to accept some volatility in exchange for growth "
        "potential above cash. Typical short-term loss tolerance ~15–20% of invested capital.",
        "Body",
    ))

    story.append(p("2. Key Questionnaire Responses", "SectionHeader"))
    story.append(table([
        ["Question", "Response"],
        ["How would you feel if your investments fell 25% over 6 months?",
         "I would be uncomfortable but would not sell."],
        ["What is your typical reaction to investment losses?",
         "Review but usually hold."],
        ["How important is capital preservation vs growth?",
         "Balanced — both matter."],
        ["How long do you expect to invest this money for?",
         "10+ years with some access needed along the way."],
        ["How much experience do you have with investments?",
         "Moderate — held an ISA for 18 years."],
    ], col_widths=[10 * cm, 6.5 * cm]))

    story.append(p("3. Discussion of Result", "SectionHeader"))
    story.append(p(
        "The Moderate result was discussed with the client. She agreed it matched her own view "
        "of her risk attitude. Specifically:",
        "Body",
    ))
    story.append(p(
        "&bull; She is not a cautious investor — she has held equity ISAs for 18 years and is "
        "comfortable with the idea of market fluctuation.<br/>"
        "&bull; She is not an aggressive investor — she does not want to chase returns and would "
        "not be comfortable with concentrated or thematic holdings.<br/>"
        "&bull; She accepts that a short-term fall of 20% is possible and would not cause her to sell.<br/>"
        "&bull; She would not be comfortable with a 40%+ fall — that would cause her to reassess.",
        "Body",
    ))

    story.append(p("4. Mapped Portfolio", "SectionHeader"))
    story.append(p(
        "A Moderate ATR maps to Helios Model Portfolio 3 (of 5): 55% global equities, "
        "35% investment-grade bonds, 10% diversifying assets. Historic 1-in-20-year drawdown "
        "approximately -22%.",
        "Body",
    ))

    story.append(p("5. Capacity for Loss (cross-reference)", "SectionHeader"))
    story.append(p(
        "Capacity for loss is assessed separately in the Fact Find section 4.2. Summary: "
        "client can absorb a 20% fall (£36,680) without affecting her retirement plans. "
        "A 40%+ fall would force her to reduce discretionary travel spending but not essential "
        "income — household essential outgoings are met by her spouse's DB pension and her "
        "State Pension independent of this fund.",
        "Body",
    ))

    story.append(p(
        "<b>Signed (client):</b> K. Chen &nbsp;&nbsp; <b>Date:</b> 14 March 2026",
        "Signature",
    ))

    doc = build_doc("02-attitude-to-risk.pdf")
    doc.build(story)


# ---------------------------------------------------------------------------
# Document 3 — Suitability Report
# ---------------------------------------------------------------------------

def build_suitability():
    story = []
    story.append(p("Suitability Report", "DocTitle"))
    story.append(p(
        f"Client: <b>{CLIENT}</b> &nbsp;&nbsp; Adviser: <b>{ADVISER}</b> &nbsp;&nbsp; "
        f"Pension Transfer Specialist: <b>Alison Reed, APFS, G60</b> &nbsp;&nbsp; "
        f"Report date: {PACK_DATE}",
        "Body",
    ))
    story.append(p(
        "Helios Wealth Management Ltd provides <b>independent</b> financial advice. "
        "We are authorised and regulated by the Financial Conduct Authority, FRN 123456.",
        "Body",
    ))

    story.append(p("1. Recommendation (in plain English)", "SectionHeader"))
    story.append(p(
        "<b>I recommend you transfer the £145,000 cash equivalent transfer value from your "
        "Meridian Engineering defined-benefit pension scheme into a new Aviva flexi-access "
        "drawdown personal pension, combined with your existing Aviva personal pension. "
        "This gives you flexibility over how and when you take income, and the ability to "
        "leave any residual fund to your nieces. It does mean giving up the guaranteed "
        "£4,200 per year income you would have received at age 65 from the Meridian scheme, "
        "and a 50% spouse's pension. You have told me that flexibility and inheritance matter "
        "more to you than the guaranteed income, because your husband's pension and your "
        "State Pension already cover your essential living costs.</b>",
        "Body",
    ))

    story.append(p("2. Target Market Statement", "SectionHeader"))
    story.append(p(
        "The Aviva flexi-access drawdown personal pension is designed for clients aged 55+ "
        "who wish to access their pension flexibly, can accept investment risk, and have "
        "sufficient secure income from other sources to meet essential needs. Mrs Chen falls "
        "within this target market: she is 64, her household essential income is secured by "
        "her spouse's DB pension and her State Pension, she has a Moderate attitude to risk, "
        "and she has expressed a clear preference for flexibility over guaranteed income.",
        "Body",
    ))

    story.append(p("3. Reasons For Recommending Transfer", "SectionHeader"))
    story.append(p(
        "&bull; <b>Flexibility:</b> You can vary your withdrawals year to year. The Meridian "
        "scheme would pay a fixed escalating income with no flexibility.<br/>"
        "&bull; <b>Inheritance:</b> Any residual fund can pass to your nieces, typically "
        "free of inheritance tax if death occurs before age 75 (subject to the lump sum and "
        "death benefit allowance). The Meridian scheme would pay a 50% spouse's pension but "
        "nothing to your nieces.<br/>"
        "&bull; <b>Planned lump sums:</b> You have specific travel plans in years 1–5 "
        "totalling approximately £45,000. The Meridian scheme would not allow ad hoc lump "
        "sums of this scale.<br/>"
        "&bull; <b>Household income security:</b> Your essential expenditure is already "
        "met by secure income sources independent of the Meridian scheme.",
        "Body",
    ))

    story.append(p("4. Reasons Against Transfer (risks and trade-offs)", "SectionHeader"))
    story.append(p(
        "You need to understand the following before proceeding. Please read each point carefully:",
        "Body",
    ))
    story.append(p(
        "&bull; <b>Loss of guarantee:</b> You lose the £4,200 pa guaranteed escalating income "
        "at 65 and the 50% spouse's pension. Once transferred, this decision is "
        "<b>generally irreversible</b>.<br/>"
        "&bull; <b>Investment risk:</b> The £145,000 transferred value will be invested in the "
        "Helios Moderate Model Portfolio 3. Its value can fall as well as rise. A 25% fall "
        "would reduce the transferred portion to approximately £108,750 in the short term.<br/>"
        "&bull; <b>Longevity risk:</b> If you live into your 90s, flexible drawdown may not "
        "produce the same lifetime income the DB scheme would have. A projection to age 95 "
        "at 4.5% growth with £15,000 pa withdrawals in years 1–5, £10,000 pa thereafter, "
        "suggests the fund may be exhausted around age 89–91 on central assumptions.<br/>"
        "&bull; <b>Critical yield shortfall:</b> The Transfer Value Analysis shows the critical "
        "yield required to match the DB scheme benefits is 8.2% pa. The recommended growth "
        "assumption is 4.5% pa. This is a material shortfall you have accepted in return "
        "for the flexibility and inheritance benefits above.",
        "Body",
    ))

    story.append(p("5. Why Not an Alternative?", "SectionHeader"))
    story.append(p(
        "<b>Keeping the DB scheme:</b> would provide guaranteed income but no flexibility or "
        "inheritance benefit for your nieces. You have stated these matter more to you.<br/>"
        "<b>Partial transfer:</b> not available under the Meridian scheme rules.<br/>"
        "<b>Alternative DC provider (e.g. AJ Bell, Fidelity):</b> Aviva selected as the "
        "receiving scheme on the basis of platform cost, investment choice (access to the "
        "Helios model portfolio), service quality, and your existing relationship with "
        "Aviva's admin (you have an existing Aviva personal pension which will be consolidated "
        "into the same arrangement).",
        "Body",
    ))

    story.append(p("6. Vulnerability", "SectionHeader"))
    story.append(p(
        "You have been flagged as potentially vulnerable under the health driver (osteoarthritis). "
        "We have taken extra care to: (a) confirm you understand the risks in your own words, "
        "(b) offer you a two-week cooling-off period before final paperwork, (c) explicitly "
        "invite you to discuss this with your husband or another trusted family member before "
        "signing. You have confirmed you are satisfied with the recommendation after discussing "
        "with your husband.",
        "Body",
    ))

    story.append(p("7. Value for Money", "SectionHeader"))
    story.append(p(
        "The recommended arrangement offers fair value for you: the total ongoing cost of "
        "approximately 0.92% per annum (platform, fund, and ongoing adviser charge combined) is "
        "in the median range for advised drawdown arrangements. In return, you receive: the "
        "Helios Moderate model portfolio, quarterly portfolio review, an annual face-to-face "
        "review, access to the Aviva client portal, and our ongoing suitability monitoring. "
        "Aviva product literature confirms the platform's service levels meet industry "
        "benchmarks.",
        "Body",
    ))

    story.append(p("8. Ongoing Service", "SectionHeader"))
    story.append(p(
        "You will receive:",
        "Body",
    ))
    story.append(p(
        "&bull; An annual face-to-face review meeting (typically October each year)<br/>"
        "&bull; A quarterly portfolio review and rebalance<br/>"
        "&bull; An annual valuation and tax summary<br/>"
        "&bull; Unlimited access to the adviser for ad hoc questions<br/>"
        "&bull; Written response to any query within 3 business days<br/>"
        "You may cancel the ongoing service at any time by writing to us; the ongoing charge "
        "will stop from the following month.",
        "Body",
    ))

    story.append(p("9. Declarations", "SectionHeader"))
    story.append(p(
        "I confirm that this recommendation is suitable for Mrs K. Chen based on the information "
        "gathered in the Fact Find dated 14 March 2026. I have considered the alternatives "
        "described in section 5 and have explained the risks described in section 4. I have no "
        "conflicts of interest to disclose in relation to this recommendation. The Pension Transfer "
        "Specialist Alison Reed has independently reviewed and approved the transfer recommendation.",
        "Body",
    ))
    story.append(p(
        f"<b>Adviser:</b> {ADVISER} &nbsp;&nbsp; <b>Signed:</b> J. Smith &nbsp;&nbsp; "
        f"<b>Date:</b> {PACK_DATE}",
        "Signature",
    ))
    story.append(p(
        "<b>Pension Transfer Specialist:</b> Alison Reed, APFS, G60 &nbsp;&nbsp; "
        "<b>Signed:</b> A. Reed &nbsp;&nbsp; <b>Date:</b> 14 March 2026",
        "Signature",
    ))
    story.append(p(
        "I confirm I have read and understood this Suitability Report, the risks described, "
        "and the costs in the separate Costs &amp; Charges disclosure. I wish to proceed.",
        "Body",
    ))
    story.append(p(
        "<b>Client:</b> K. Chen &nbsp;&nbsp; <b>Signed:</b> K. Chen &nbsp;&nbsp; "
        f"<b>Date:</b> {PACK_DATE}",
        "Signature",
    ))

    doc = build_doc("03-suitability-report.pdf")
    doc.build(story)


# ---------------------------------------------------------------------------
# Document 4 — Costs & Charges Disclosure
# ---------------------------------------------------------------------------

def build_costs():
    story = []
    story.append(p("Costs & Charges Disclosure", "DocTitle"))
    story.append(p(
        f"Client: <b>{CLIENT}</b> &nbsp;&nbsp; Recommendation: Transfer to Aviva Flexi-Access Drawdown &nbsp;&nbsp; Date: {PACK_DATE}",
        "Body",
    ))

    story.append(p("1. Initial Charges", "SectionHeader"))
    story.append(table([
        ["Charge", "Basis", "Amount (£)"],
        ["Initial advice charge", "2.00% of £145,000 transferred", "£2,900"],
        ["Initial advice charge", "2.00% of £38,400 existing Aviva pension consolidated", "£768"],
        ["Initial advice charge total", "", "£3,668"],
        ["Set-up fee (Aviva platform)", "Waived on transfer", "£0"],
        ["Pension Transfer Specialist fee", "Included in initial advice charge above", "£0"],
    ], col_widths=[6 * cm, 7 * cm, 3.5 * cm]))
    story.append(p(
        "The initial advice charge will be deducted from the combined fund after transfer and "
        "consolidation. You may alternatively pay it by invoice — please indicate your preference "
        "on the acceptance form.",
        "Body",
    ))

    story.append(p("2. Ongoing Charges (per annum)", "SectionHeader"))
    story.append(table([
        ["Charge", "Basis", "% of fund", "First-year £ (on £179,732)"],
        ["Platform charge (Aviva)", "Tiered", "0.25%", "£449"],
        ["Fund charge (Helios Moderate Portfolio 3)", "Weighted average OCF", "0.27%", "£485"],
        ["Ongoing adviser charge", "0.50% of fund value", "0.40%", "£719"],
        ["Transaction costs (estimated)", "MiFID II", "0.05%", "£90"],
        ["Total ongoing cost", "", "0.97%", "£1,743"],
    ], col_widths=[5.5 * cm, 4 * cm, 3 * cm, 4 * cm]))

    story.append(p("3. Comparison to Existing Arrangement", "SectionHeader"))
    story.append(p(
        "The Meridian DB scheme does not levy member-level charges in the same form; the benefit "
        "is expressed as a guaranteed income. We therefore compare to the alternative of leaving "
        "the existing Aviva personal pension unchanged and keeping the Meridian DB benefit:",
        "Body",
    ))
    story.append(table([
        ["Arrangement", "Year 1 cost (£)", "Year 1 cost (%)"],
        ["Recommended: consolidated flexi-access drawdown", "£1,743", "0.97%"],
        ["Current: Aviva PP £38,400 ongoing cost only", "£377", "0.98%"],
        ["Current: Meridian DB (no member-level cost)", "—", "—"],
    ], col_widths=[9 * cm, 4 * cm, 3.5 * cm]))
    story.append(p(
        "<i>The recommended arrangement has a similar ongoing cost percentage to your existing "
        "Aviva PP. The additional cost in pounds reflects the larger fund under management.</i>",
        "Body",
    ))

    story.append(p("4. Cumulative Cost Projection", "SectionHeader"))
    story.append(p(
        "A year-1 projection is shown above. For longer-term cumulative projections please refer "
        "to the separate product illustration document.",
        "Body",
    ))

    story.append(p("5. Cancellation of Ongoing Service", "SectionHeader"))
    story.append(p(
        "You may cancel the ongoing adviser charge at any time by writing to Helios Wealth "
        "Management at the address below. The ongoing charge will cease from the following month. "
        "Platform and fund charges will continue so long as you remain invested through Aviva.",
        "Body",
    ))

    story.append(p(
        "<b>Signed (adviser):</b> J. Smith &nbsp;&nbsp; <b>Date:</b> 14 March 2026",
        "Signature",
    ))

    doc = build_doc("04-costs-and-charges.pdf")
    doc.build(story)


# ---------------------------------------------------------------------------
# Document 5 — Product Illustration
# ---------------------------------------------------------------------------

def build_illustration():
    story = []
    story.append(p("Product Illustration", "DocTitle"))
    story.append(p(
        "Aviva Flexi-Access Drawdown Personal Pension — Illustration for "
        f"<b>{CLIENT}</b> &nbsp;&nbsp; Quotation date: {PACK_DATE} &nbsp;&nbsp; "
        "Quote reference: AV-2026-0314-KCHEN",
        "Body",
    ))

    story.append(p("1. Transfer Summary", "SectionHeader"))
    story.append(table([
        ["Source of funds", "Amount (£)"],
        ["Meridian Engineering Pension Scheme (CETV)", "£145,000"],
        ["Aviva Personal Pension (consolidation)", "£38,400"],
        ["Total opening value", "£183,400"],
        ["Less initial advice charge", "-£3,668"],
        ["Net invested amount", "£179,732"],
    ], col_widths=[11 * cm, 5 * cm]))

    story.append(p("2. Assumed Withdrawal Pattern", "SectionHeader"))
    story.append(p(
        "Years 1–5: £15,000 per annum (travel and discretionary). "
        "Years 6+: £10,000 per annum, escalating with CPI (assumed 2.5%).",
        "Body",
    ))

    story.append(p("3. Projected Fund Values — Central Assumption (4.5% pa growth)", "SectionHeader"))
    story.append(table([
        ["Year", "Age", "Opening fund (£)", "Withdrawal (£)", "Growth (£)", "Closing fund (£)"],
        ["1", "64", "179,732", "15,000", "7,563", "172,295"],
        ["2", "65", "172,295", "15,000", "7,228", "164,523"],
        ["3", "66", "164,523", "15,000", "6,878", "156,401"],
        ["4", "67", "156,401", "15,000", "6,513", "147,914"],
        ["5", "68", "147,914", "15,000", "6,131", "139,045"],
        ["10", "73", "118,200", "11,315", "5,139", "112,024"],
        ["15", "78", "94,300", "12,800", "3,862", "85,362"],
        ["20", "83", "55,800", "14,480", "1,724", "43,044"],
        ["25", "88", "—", "—", "—", "Exhausted ~age 89"],
    ], col_widths=[1.5 * cm, 1.5 * cm, 3.5 * cm, 3 * cm, 3 * cm, 3.5 * cm]))

    story.append(p("4. Alternative Growth Scenarios", "SectionHeader"))
    story.append(table([
        ["Scenario", "Growth pa", "Fund exhausted approx. age"],
        ["Lower", "2.0%", "Age 82"],
        ["Central (recommended basis)", "4.5%", "Age 89"],
        ["Higher", "7.0%", "Fund lasts to age 95 with residual £85,000"],
    ], col_widths=[6 * cm, 4 * cm, 6.5 * cm]))

    story.append(p(
        "<b>The value of your investments can go down as well as up. You may get back less than you "
        "invested. Past performance is not a reliable indicator of future results. If you transfer "
        "out of your defined-benefit pension, you will lose the guaranteed income for life that the "
        "scheme provides, and this decision is generally irreversible.</b>",
        "Body",
    ))

    story.append(p("5. Tax Treatment", "SectionHeader"))
    story.append(p(
        "25% of the fund may be taken tax-free as pension commencement lump sum, subject to the "
        "lump sum allowance of £268,275 (2025/26). Remaining withdrawals are taxed as income at "
        "your marginal rate. Tax treatment depends on your individual circumstances and may change. "
        "For this recommendation specifically: assuming combined taxable household income "
        "(spouse DB £28,400 + your State Pension £11,502 + £7,500 marginal from drawdown) the next "
        "£10,000+ of drawdown income falls within the basic rate band.",
        "Body",
    ))

    story.append(p("6. Cancellation", "SectionHeader"))
    story.append(p(
        "You have the right to cancel this arrangement within 30 days of receiving the policy "
        "documents. To cancel, write to Aviva at the address in the policy documents. Please note "
        "that if you cancel after the DB scheme transfer has been processed, <b>the DB transfer is "
        "generally irreversible</b> — the Meridian scheme is not obliged to accept a return of "
        "transferred funds. If you cancel within the 30-day period, the value returned may be "
        "less than you invested if markets have fallen.",
        "Body",
    ))

    story.append(p("7. Financial Services Compensation Scheme", "SectionHeader"))
    story.append(p(
        "Your investments may be covered by the Financial Services Compensation Scheme (FSCS). "
        "If Aviva were unable to meet its obligations, you may be entitled to compensation up to "
        "<b>£75,000 for investment claims</b>. Further information is available at fscs.org.uk or "
        "0800 678 1100.",
        "Body",
    ))
    story.append(p(
        "<i>(Note to reviewer: this FSCS figure is deliberately out of date in the sample pack — "
        "the current investment limit is £85,000 — so the Disclosure Checker flags it.)</i>",
        "Small",
    ))

    story.append(p("8. Complaints", "SectionHeader"))
    story.append(p(
        "If you are unhappy with any aspect of our service, please contact the Complaints Officer "
        "at Helios Wealth Management, 10 Bishops Square, Farnham, Surrey, GU9 7DP, or "
        "complaints@helioswealth.example. We will acknowledge your complaint within 3 business "
        "days and aim to resolve it within 8 weeks. If we cannot resolve your complaint to your "
        "satisfaction, or if 8 weeks have passed, you have the right to refer the matter to the "
        "Financial Ombudsman Service at financial-ombudsman.org.uk or 0800 023 4567.",
        "Body",
    ))

    doc = build_doc("05-product-illustration.pdf")
    doc.build(story)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    print("Generating sample Helios advice pack PDFs...")
    build_fact_find()
    print("  01-fact-find.pdf")
    build_atr()
    print("  02-attitude-to-risk.pdf")
    build_suitability()
    print("  03-suitability-report.pdf")
    build_costs()
    print("  04-costs-and-charges.pdf")
    build_illustration()
    print("  05-product-illustration.pdf")
    print("Done.")


if __name__ == "__main__":
    main()
