# Roles and permissions

About 10 users. Four roles. Users can be added and removed by the Administrator.

## Matrix

| Area | Administrator | Litigation Assistant | Lawyer | Paralegal |
|---|---|---|---|---|
| Clients | full | add / edit | view | view |
| Contacts | full | add / edit | view | view |
| Matters | full | add / edit | view | view |
| Hearings | full | add / edit | view | view |
| **Administrative works** | full | add / edit | view | **add / edit** |
| Powers of attorney | full | add / edit | view | view |
| Documents register | full | add / edit | view | view |
| Fee letters | full | add / edit | view | view |
| Invoices & payments | **view** | **view** | **view** | **view** |
| Run and export reports | yes | yes | yes | yes |
| Staff roster | **manage** | view | view | view |
| Users and roles | **manage** | no | no | no |
| Dropdown lists | **manage** | no | no | no |

## Notes

**Invoices are view-only for everyone, including the Administrator.** New
invoicing lives in Excel until Phase 2, so there is nothing to create here yet.

**Billing is visible to all roles, for all clients.** Not restricted to the
lawyer's own matters — 834 of 1,730 matters have no lawyer recorded, so such a
rule would hide billing from everyone. See D14.

**Everyone can export.** If a role can see data on screen, it can export it to
Excel or PDF.

**Only the Administrator manages the dropdown lists** (courts, categories,
degrees, venues, party roles).

## Implementation rules

1. **Enforce on the server.** Hiding a button is not security. Every API route
   checks the role.
2. **Record who changed what.** Every table carries `created_by`, `created_at`,
   `updated_by`, `updated_at`. The old system had no audit trail at all; this is
   one of the main reasons for replacing it.
3. **Former staff cannot log in.** 46 of 140 people have left the firm. They
   remain in the roster so historical records still show who did the work, but
   `can_login` is false and they do not appear in dropdowns for new entries.
4. **Roles are fixed in Phase 1.** No custom role builder. Four roles, hardcoded.
