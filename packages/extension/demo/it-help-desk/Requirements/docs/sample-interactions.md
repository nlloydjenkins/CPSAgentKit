# IT Help Desk — Sample Interactions

These are representative conversations the solution should handle. Use them to inform the spec, architecture, and success criteria. The solution is multi-agent: a parent orchestrator routes to a Knowledge Specialist (SharePoint answers) and a Notification Specialist (Teams/Outlook alerts), while the parent itself owns Dataverse ticket operations via MCP.

---

## Scenario 1: Knowledge Base Answer (Happy Path)

**Employee:** How do I connect to VPN from home?

**Agent (routed to Knowledge Specialist):** Hi Sarah! To connect to the Contoso VPN from home:

1. Open the **GlobalProtect** app on your laptop
2. Enter the portal address: `vpn.contoso.com`
3. Sign in with your Contoso email and password
4. Approve the MFA prompt on your phone
5. Click **Connect**

If you're having trouble connecting, I can create a support ticket for the IT team.

_[Source: IT Knowledge Base — Remote Access Setup]_

---

## Scenario 2: Ticket Creation with Notification

**Employee:** My laptop screen is flickering and I can't work properly.

**Agent (parent — Knowledge Specialist has no answer, parent handles ticket):** I'm sorry about that, James. I don't have a specific fix for screen flickering in the knowledge base, so let me create a support ticket for you.

Can you confirm a few details?

- **Office location:** London, Manchester, or Edinburgh?
- **Device type:** Laptop, Desktop, or Mobile?
- **How urgent is this?** (Low — can wait, Medium — affecting work, High — blocking work)

**Employee:** Manchester, Laptop, High — I can barely see anything.

**Agent (parent creates ticket via Dataverse MCP, then delegates to Notification Specialist):** I've created ticket **INC-00042** for you:

- **Issue:** Laptop screen flickering — employee cannot work
- **Priority:** High
- **Location:** Manchester
- **Device:** Laptop

Since this is high priority, I've notified the IT team:

- ✉️ Email sent to itsupport@contoso.com
- 💬 Posted in the IT Support Teams channel

Your manager (David Chen) has been included for visibility. You can check the status anytime by asking me "What's the status of my ticket?"

---

## Scenario 3: Ticket Status Check

**Employee:** What's the status of my ticket INC-00042?

**Agent (parent queries Dataverse MCP):** Your ticket **INC-00042** is currently **In Progress**:

- **Issue:** Laptop screen flickering
- **Created:** 28 March 2026
- **Last updated:** 29 March 2026

The IT team is working on it. If you need to add more information, reply here and I'll update the ticket.

---

## Scenario 4: Escalation to Human

**Employee:** I think my account has been compromised. I'm seeing emails I didn't send.

**Agent:** I'm taking this seriously, Alex. A potential account compromise is a security incident, so I'm escalating this to an IT analyst right now.

_[Agent triggers escalation to human — passes conversation context, user profile, and flags as Critical]_

---

## Scenario 5: Out of Scope (Polite Redirect)

**Employee:** Can you help me submit my expenses?

**Agent:** I'm the IT Help Desk agent, so I can only help with IT-related questions like VPN, passwords, software, and hardware issues. For expenses, please contact the Finance team or use the Expenses portal at https://expenses.contoso.com.

Is there anything IT-related I can help you with?

---

## Scenario 6: Low Priority Ticket (No Notification)

**Employee:** The printer on the 3rd floor in Edinburgh keeps jamming. Is there a fix?

**Agent (Knowledge Specialist has no answer, parent creates ticket):** I checked the knowledge base but don't have a specific troubleshooting guide for the Edinburgh 3rd floor printer. Let me create a ticket so the IT team can look into it.

What priority would you give this? (Low, Medium, or High)

**Employee:** Low — there are other printers nearby.

**Agent:** Done! Ticket **INC-00043** created:

- **Issue:** Edinburgh 3rd floor printer jamming
- **Priority:** Low
- **Location:** Edinburgh

Since this is low priority, it's in the queue and the IT team will get to it in order. No email or Teams notification is sent for low-priority tickets.

---

## Scenario 7: Update a Ticket

**Employee:** Can you update my Broken Laptop Screen ticket?

**Agent (parent queries Dataverse MCP by cr85a_name + user email):** I found your ticket **Broken Laptop Screen** (INC-00042):

- **Status:** In Progress
- **Priority:** High
- **Issue:** Laptop screen flickering — employee cannot work

What would you like to update? I can change the issue summary, priority, status, device type, or office location.

**Employee:** Change the priority to Medium — I got a loaner laptop so it's not blocking me anymore.

**Agent (parent updates via Dataverse MCP):** Done! I've updated **Broken Laptop Screen** (INC-00042):

- **Priority:** Medium (was High)

Anything else you'd like to change?

---

## Scenario 8: Delete a Ticket

**Employee:** Delete my Edinburgh printer ticket.

**Agent (parent queries Dataverse MCP by cr85a_name + user email):** I found your ticket **Edinburgh Printer Jamming** (INC-00043):

- **Status:** Open
- **Priority:** Low
- **Issue:** Edinburgh 3rd floor printer jamming

Are you sure you want to delete this ticket? This cannot be undone.

**Employee:** Yes, delete it.

**Agent (parent deletes via Dataverse MCP):** Ticket **Edinburgh Printer Jamming** (INC-00043) has been deleted.

---

## Scenario 9: Update Ticket — Ambiguous Match

**Employee:** Update my printer ticket.

**Agent (parent finds multiple matches for user):** I found more than one ticket that could match. Which one did you mean?

1. **Printer Blank Pages** (INC-00001) — Open, Low priority
2. **Edinburgh Printer Jamming** (INC-00043) — Open, Low priority

**Employee:** The first one.

**Agent:** Got it — **Printer Blank Pages** (INC-00001). What would you like to update?
