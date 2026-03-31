# Dataverse Seed Data — IT Support Tickets

Use the Dataverse MCP Server to create these sample records in the `cr85a_it_support_tickets` table after the table is created during the Build phase. These records allow immediate testing of the "check ticket status" flow.

## Table: cr85a_it_support_tickets

### Record 1 — Open ticket (Low priority)

| Column                | Value                                                                            |
| --------------------- | -------------------------------------------------------------------------------- |
| cr85a_employee_name   | Sarah Mitchell                                                                   |
| cr85a_employee_email  | sarah.mitchell@contoso.com                                                       |
| cr85a_issue_summary   | Printer LDN-F3-HP01 on Floor 3 London is printing blank pages. Toner shows full. |
| cr85a_priority        | 100000000                                                                        |
| cr85a_office_location | 100000000                                                                        |
| cr85a_device_type     | 100000003                                                                        |
| cr85a_status          | 100000000                                                                        |
| cr85a_manager_email   |                                                                                  |

### Record 2 — In Progress ticket (Medium priority)

| Column                | Value                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| cr85a_employee_name   | James Cooper                                                                                                                        |
| cr85a_employee_email  | james.cooper@contoso.com                                                                                                            |
| cr85a_issue_summary   | Cannot install Visual Studio Code from Company Portal — gets error "Installation blocked by policy". Tried twice, restarted laptop. |
| cr85a_priority        | 100000001                                                                                                                           |
| cr85a_office_location | 100000001                                                                                                                           |
| cr85a_device_type     | 100000000                                                                                                                           |
| cr85a_status          | 100000001                                                                                                                           |
| cr85a_manager_email   |                                                                                                                                     |

### Record 3 — In Progress ticket (High priority, with manager)

| Column                | Value                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| cr85a_employee_name   | Alex Rivera                                                                                                                   |
| cr85a_employee_email  | alex.rivera@contoso.com                                                                                                       |
| cr85a_issue_summary   | Laptop screen flickering constantly since this morning. Cannot work — display is unusable. Dell Latitude 5540, 18 months old. |
| cr85a_priority        | 100000002                                                                                                                     |
| cr85a_office_location | 100000001                                                                                                                     |
| cr85a_device_type     | 100000000                                                                                                                     |
| cr85a_status          | 100000001                                                                                                                     |
| cr85a_manager_email   | david.chen@contoso.com                                                                                                        |

### Record 4 — Resolved ticket

| Column                | Value                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| cr85a_employee_name   | Priya Sharma                                                                                      |
| cr85a_employee_email  | priya.sharma@contoso.com                                                                          |
| cr85a_issue_summary   | VPN connection drops every 10 minutes when working from home. Using GlobalProtect on MacBook Pro. |
| cr85a_priority        | 100000001                                                                                         |
| cr85a_office_location | 100000000                                                                                         |
| cr85a_device_type     | 100000000                                                                                         |
| cr85a_status          | 100000002                                                                                         |
| cr85a_manager_email   |                                                                                                   |

### Record 5 — Closed ticket

| Column                | Value                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| cr85a_employee_name   | Tom Henderson                                                                                  |
| cr85a_employee_email  | tom.henderson@contoso.com                                                                      |
| cr85a_issue_summary   | New starter — need access to the Design team SharePoint site and Adobe Creative Cloud licence. |
| cr85a_priority        | 100000000                                                                                      |
| cr85a_office_location | 100000002                                                                                      |
| cr85a_device_type     | 100000000                                                                                      |
| cr85a_status          | 100000003                                                                                      |
| cr85a_manager_email   |                                                                                                |

## Notes

- The Build Agent "Full build" command will detect the Dataverse MCP Server connection and automatically include a Dataverse creation + seeding stage. These records should be created as part of that stage.
- If running the seed manually, use the Dataverse MCP tool in GitHub Copilot Agent mode: `"Create these 5 sample records in the cr85a_it_support_tickets table"` and paste the table above.
- The auto-number column `cr85a_ticket_id` will be assigned automatically (INC-00001 through INC-00005).
- Choice columns use integer values. See `Requirements/docs/it-systems-context.md` for the full integer mapping (e.g., Priority: Low=100000000, Medium=100000001, High=100000002, Critical=100000003).
