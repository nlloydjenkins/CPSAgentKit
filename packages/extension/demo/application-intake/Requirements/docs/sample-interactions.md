# Application Intake Agent — Sample Interactions

These are representative email scenarios the solution should handle. The agent is autonomous (mailbox-triggered) — applicants never chat with it directly. They send email; the agent processes, stores, evaluates, and responds via email.

---

## Scenario 1: Complete New Application (Happy Path)

**Inbound email:**

```
From: sarah.mitchell@example.com
Subject: Change of Tenancy — 14 Elm Street

Hi,

I'd like to apply for a change of tenancy at 14 Elm Street, Flat 2.
My full name is Sarah Mitchell, date of birth 12/03/1988.
My current account number is AC-884521.
Contact number: 07700 900123.

Please let me know if you need anything else.

Thanks,
Sarah
```

**Expected pipeline:**

1. Email Interpreter extracts: name, DOB, address, account number, contact number, type = Account Amendment (Change of Tenancy)
2. Completeness Assessor returns `PROCEED` — all required fields present
3. Correspondence Drafter produces acknowledgement email
4. Compliance Evaluator passes the draft (includes required disclosures, no unauthorised commitments)
5. Accessibility Presenter reformats for plain English, short paragraphs, action-first structure
6. Final email sent from shared mailbox
7. Dataverse: application record created, correspondence logged, compliance check logged with PASS

---

## Scenario 2: Incomplete Application — Information Request

**Inbound email:**

```
From: a.jones@example.com
Subject: Tenancy change

Hi, I want to change my tenancy at 7 Oak Lane. My name is Alex Jones.

Cheers
```

**Expected pipeline:**

1. Email Interpreter extracts: name, address. Missing: DOB, account number, contact number
2. Completeness Assessor returns `REQUEST_INFO` — lists missing fields
3. Correspondence Drafter produces information request listing exactly the 3 missing fields, confirming name and address were received
4. Compliance Evaluator checks draft — ensures data handling disclosure is included (first contact)
5. Accessibility Presenter reformats
6. Email sent; Dataverse status = Awaiting Applicant; NextChaseDate set to +3 business days

---

## Scenario 3: Reply with Missing Information (Thread Continuation)

**Inbound email (reply to Scenario 2):**

```
From: a.jones@example.com
Subject: RE: Your application APP-2026-0002

Hi,

My date of birth is 15/07/1992, account number AC-773100, and you can reach me on 07700 456789.

Alex
```

**Expected pipeline:**

1. Email Interpreter recognises thread (matches to APP-2026-0002)
2. Merges new fields into existing record — preserves previously captured name and address
3. Completeness Assessor returns `PROCEED` — all required fields now present
4. Correspondence Drafter produces acknowledgement
5. Full compliance + accessibility loop
6. Email sent; Dataverse status updated to Ready for Processing

---

## Scenario 4: Contradiction Escalation

**Inbound email (reply on existing thread):**

```
From: sarah.mitchell@example.com
Subject: RE: Your application APP-2026-0001

Actually, my account number is AC-997632, not AC-884521. Sorry for the confusion.
```

**Expected pipeline:**

1. Email Interpreter detects thread (matches to APP-2026-0001)
2. Flags contradiction: account number changed from AC-884521 to AC-997632
3. Completeness Assessor returns `ESCALATE` — contradictory field on critical value
4. Parent posts Teams adaptive card with both values shown
5. Original value NOT overwritten in Dataverse
6. No outbound email sent to applicant
7. Dataverse status = Escalated, reason = Contradiction

---

## Scenario 5: Ambiguous / Unclear Intent

**Inbound email:**

```
From: j.khan@example.com
Subject: Help needed

I need to sort out my account. Things have changed and I'm not sure what form I need. Can someone call me on 07700 123456?

Thanks, Jamil
```

**Expected pipeline:**

1. Email Interpreter returns low confidence on application type — intent is unclear
2. Completeness Assessor returns `ESCALATE` — insufficient data, ambiguous intent
3. Parent posts Teams adaptive card for human review — includes Email Interpreter's best-guess types with confidence scores
4. No automated outbound email sent

---

## Scenario 6: Compliance Violation in Draft

**Context:** The Correspondence Drafter produces a draft that includes "Your application will be approved within 5 working days."

**Expected pipeline:**

1. Compliance Evaluator returns FAIL — Rule 1 (No Unauthorised Commitments) violated
2. Revision instruction: "Remove the timeline promise. Replace with permitted phrasing from the Authorised Commitments list."
3. Parent sends revision instruction back to Correspondence Drafter
4. Revised draft re-evaluated — passes compliance
5. Proceeds to Accessibility Presenter

---

## Scenario 7: Chase Email

**Context:** An application has Status = Awaiting Applicant and NextChaseDate = today. Daily chase scan fires.

**Expected pipeline:**

1. Chase scan finds the overdue application
2. Correspondence Drafter produces chase email referencing the original application and missing fields
3. Full compliance + accessibility loop (chase emails require the "consequence of non-response" disclosure)
4. Chase email sent; Dataverse chase count incremented; new NextChaseDate set
5. If chase limit reached (default 2), escalate instead of drafting another chase

---

## Scenario 8: New Application with Attachment

**Inbound email:**

```
From: priya.sharma@example.com
Subject: New account application

Hi,

I'd like to open a new account. I've attached my supporting documents.

My name is Priya Sharma, email priya.sharma@example.com.
I'd like to start on 1 May 2026.

Thanks,
Priya
```

_Attachment: supporting-documents.pdf (2 pages, contains proof of address)_

**Expected pipeline:**

1. Attachment Preprocessor converts PDF to text/Markdown
2. Email Interpreter processes email body + normalised attachment text
3. Extracts: name, email, start date, type = New Application, plus any additional fields from the attachment
4. Completeness Assessor evaluates against New Application required fields
5. Pipeline continues based on completeness verdict
