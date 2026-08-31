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
| Client logo upload | full | add / edit | view | view |
| Invoices & payments | **view** | **view** | **view** | **view** |
| Run and export reports | yes | yes | yes | yes |
| Staff roster | **manage** | view | view | view |
| Users and roles | **manage** | no | no | no |
| Dropdown lists | **manage** | no | no | no |

## Notes

Task 3.1 stores these four role codes on the initial accounts. **Task 3.2 now
enforces this matrix on the server.** The exhaustive policy is
`src/lib/auth/permissions.ts`; the server-only guard that reads the validated
Auth.js session is `src/lib/auth/authorization.ts`. It never accepts a role
from a request, query string, header or client component.

`proxy.ts` continues to perform early authentication redirects, but it is not
authorization. Every page, route handler and server action is independently
classified in `src/lib/auth/route-inventory.ts`. The lightweight structural
check is part of `npm run check`, and `npm run test:permissions` provides the
full negative suite. Both fail if a future entry point is unclassified, if a
permission-classified entry point does not call the correct server guard, or
if the proxy is offered as its only protection.

**Invoices are view-only for everyone, including the Administrator.** New
invoicing lives in Excel until Phase 2, so there is nothing to create here yet.

**Billing is visible to all roles, for all clients.** Not restricted to the
lawyer's own matters — 834 of 1,730 matters have no lawyer recorded, so such a
rule would hide billing from everyone. See D14.

**Everyone can export.** If a role can see data on screen, it can export it to
Excel or PDF.

**Only the Administrator manages the dropdown lists** (courts, categories,
degrees, venues, party roles).

**No deletion permission exists.** In this matrix, `full` means view, create
and update for the operational areas. It does not imply deletion. Adding any
record-deletion operation requires a separate decision from the firm.

## Server denial behavior

- A missing or invalid session is an authentication failure: pages go to the
  login screen and route handlers return HTTP 401.
- A valid session without the required permission is an authorization failure:
  route handlers and server actions fail with HTTP-style 403 semantics. Pages
  are redirected server-side to the Arabic denial endpoint, whose final
  response is HTTP 403.
- A session that still requires a password change cannot use a business guard.
- Unknown roles, areas and actions are denied. There is no fallback role.
- Billing is view-only for all four roles, including the Administrator.
- All four roles may run and export reports.

Next.js 16.3.1 still marks its `unauthorized()` and `forbidden()` interrupts as
experimental. Task 3.2 does not enable them. It uses stable redirects for
pages and ordinary 401/403 responses for handlers instead.

## Implementation rules

1. **Enforce on the server.** Hiding a button is not security. Every API route
   checks the role.
2. **Record who changed what.** Every table carries `created_by`, `created_at`,
   `updated_by`, `updated_at`. The old system had no audit trail at all; this is
   one of the main reasons for replacing it.
3. **Former staff cannot log in.** 43 of 135 people have left the firm. They
   remain in the roster so historical records still show who did the work, but
   `can_login` is false and they do not appear in dropdowns for new entries.
4. **Roles are fixed in Phase 1.** No custom role builder. Four roles, hardcoded.
5. **Classify every new entry point.** A new `page.tsx`, `route.ts` or server
   action must be added to the route inventory and guarded at the server
   boundary before it can pass the permission suite.
6. **Auditing is still Task 3.3.** Task 3.2 decides whether an operation is
   allowed; it does not claim to populate `created_by` or `updated_by`.
7. **User management is still Task 3.4.** Administrator permission exists in
   the policy, but no user-management screen or mutation is built yet.
