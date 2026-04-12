# Dataverse Seed Data — Application Intake

Use the Dataverse connector or MCP Server to create these sample records after the tables are created during the Build phase. These records allow immediate testing of thread matching, chase workflows, and status-based queries.

## Table: cr85a_applications

### Record 1 — Complete application, ready for processing

| Column                   | Value                      |
| ------------------------ | -------------------------- |
| cr85a_name               | APP-2026-0001              |
| cr85a_applicant_name     | Sarah Mitchell             |
| cr85a_applicant_email    | sarah.mitchell@example.com |
| cr85a_account_number     | AC-884521                  |
| cr85a_application_type   | 100000000                  |
| cr85a_status             | 100000002                  |
| cr85a_assigned_queue     | Account Services           |
| cr85a_overall_confidence | 0.95                       |
| cr85a_chase_count        | 0                          |
| cr85a_dob                | 12/03/1988                 |
| cr85a_contact_number     | 07700 900123               |
| cr85a_address            | 14 Elm Street, Flat 2      |

### Record 2 — Awaiting applicant (incomplete, chase due)

| Column                   | Value               |
| ------------------------ | ------------------- |
| cr85a_name               | APP-2026-0002       |
| cr85a_applicant_name     | Alex Jones          |
| cr85a_applicant_email    | a.jones@example.com |
| cr85a_account_number     |                     |
| cr85a_application_type   | 100000000           |
| cr85a_status             | 100000001           |
| cr85a_assigned_queue     |                     |
| cr85a_overall_confidence | 0.72                |
| cr85a_chase_count        | 1                   |
| cr85a_next_chase_date    | 2026-04-10          |
| cr85a_dob                |                     |
| cr85a_contact_number     |                     |
| cr85a_address            | 7 Oak Lane          |

### Record 3 — Escalated (contradiction detected)

| Column                   | Value                                          |
| ------------------------ | ---------------------------------------------- |
| cr85a_name               | APP-2026-0003                                  |
| cr85a_applicant_name     | David Thompson                                 |
| cr85a_applicant_email    | d.thompson@example.com                         |
| cr85a_account_number     | AC-556200                                      |
| cr85a_application_type   | 100000002                                      |
| cr85a_status             | 100000003                                      |
| cr85a_assigned_queue     |                                                |
| cr85a_escalation_reason  | Contradiction: account number changed in reply |
| cr85a_overall_confidence | 0.88                                           |
| cr85a_chase_count        | 0                                              |
| cr85a_dob                | 22/11/1975                                     |
| cr85a_contact_number     | 07700 334455                                   |
| cr85a_address            | 9 Birch Road                                   |

### Record 4 — New application pending interpretation

| Column                   | Value                    |
| ------------------------ | ------------------------ |
| cr85a_name               | APP-2026-0004            |
| cr85a_applicant_name     | Priya Sharma             |
| cr85a_applicant_email    | priya.sharma@example.com |
| cr85a_account_number     |                          |
| cr85a_application_type   | 100000001                |
| cr85a_status             | 100000000                |
| cr85a_assigned_queue     |                          |
| cr85a_overall_confidence | 0.65                     |
| cr85a_chase_count        | 0                        |
| cr85a_dob                |                          |
| cr85a_contact_number     |                          |
| cr85a_address            |                          |

### Record 5 — Closed — no response

| Column                   | Value                             |
| ------------------------ | --------------------------------- |
| cr85a_name               | APP-2026-0005                     |
| cr85a_applicant_name     | Tom Henderson                     |
| cr85a_applicant_email    | t.henderson@example.com           |
| cr85a_account_number     | AC-112300                         |
| cr85a_application_type   | 100000000                         |
| cr85a_status             | 100000006                         |
| cr85a_assigned_queue     | Account Services                  |
| cr85a_escalation_reason  | Chase limit reached — no response |
| cr85a_overall_confidence | 0.91                              |
| cr85a_chase_count        | 2                                 |
| cr85a_dob                | 03/06/1990                        |
| cr85a_contact_number     | 07700 778899                      |
| cr85a_address            | 22 Maple Drive, Unit 4            |

## Notes

- The Build Agent "Full build" command will detect Dataverse connector actions and can include a seeding stage. These records should be created as part of that stage.
- Choice columns use integer values. See `Requirements/docs/systems-context.md` for the full integer mappings.
- The `cr85a_name` column is the primary name column and holds the reference number. The auto-number `cr85a_reference_number` will generate on creation — the values above are illustrative.
- Record 2 has `NextChaseDate` in the past to allow immediate testing of the chase workflow.
- Record 3 demonstrates an escalated case for testing the contradiction/escalation path.
