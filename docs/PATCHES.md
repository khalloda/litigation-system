# Patches to existing repo files

> **STATUS: APPLIED — 2026-08-20.**
> Every patch below is already in the repo. This file is kept as a record of
> what changed and why. **Do not apply it again.**

Small edits to files already in the repo. Apply these by hand — they are short.

---

## `docs/DATA-MODEL.md`

Replace the `client_logos` block with:

```
### `client_logos` — 54 rows
Extracted from an Access Attachment column.

Stored as FILES IN A FOLDER on the server, not in the database and not in cloud
storage. See decision D15.

    /var/lib/litigation/client-logos/{client_id}/{filename}

The table holds: client_id, relative_path, file_name, content_type, byte_size.
Never the image itself.

MANDATORY safeguards (D15):
  - the database and this folder are backed up in ONE operation
  - a weekly job lists any client whose file is missing
  - a missing file prints the client's name in text, never a broken image

See MIGRATION.md for extraction. A normal CSV export destroys these (D11).
```

Add to the `documents` block:

```
mfiles_id — optional reference to the firm's M-Files document system.
Precedent: خطابات الأتعاب.mfilesID is populated on 306 of 331 rows.
```

Add to `matters`:

```
court_id     FK — court name
circuit_id   FK — court circuit, stored SEPARATELY from the court.
             Reports join them for display:
             "الإدارية العليا (11 موضوع)"

             [Correction, applied later: this patch originally cited D18.
              D18 is the parameterised client report. The source for
              court/circuit separation is docs/REPORT-LAYOUTS.md, Type 4.]
```

---

## `docs/PRD.md`

- Change every mention of **49 reports** to **45 reports**
- In section 5, add: *"Client-facing reports carry the client's own logo. Where
  none exists — 259 of 313 clients — the client's name prints in text instead."*

---

## `docs/PERMISSIONS.md`

Add a row to the matrix:

| Area | Administrator | Litigation Assistant | Lawyer | Paralegal |
|---|---|---|---|---|
| Client logo upload | full | add / edit | view | view |

---

## `TASKS.md`

**Replace task 7.2** with:

```
- [ ] 7.2 Backups — three layers, all required (D16)
      a) Nightly automated backup of the database AND the client-logo folder
         in ONE operation. 30 nights retained.
      b) Those backups copied OFF the VM — another machine, network share or
         cloud. A backup on the server dies with the server.
      c) The firm's weekly/monthly VM snapshot stays as the disaster layer.
      d) Weekly integrity job: list clients whose logo file is missing.
      e) TEST A RESTORE onto a spare machine before go-live, and confirm a
         client logo appears in a printed report. Do not skip this.
```

**Replace task 6.2** with:

```
- [ ] 6.2 Client reports
      NOTE: تقرير عملاء 2 / 6 / 8 and تقرير عملاء -جميع الدعاوى سارية ومنتهية
      are ONE parameterised report (D17). Build it once.
      Layout: docs/REPORT-LAYOUTS.md, "Type 4 — Client status report".
      Includes the client's own logo, with a text fallback.
```

**Add to task 6.8:**

```
      Only ONE report now has an unknown layout: صالح-ضد مفصل حسب المحامي.
      Copy Of صالح-ضد temp-JTI has been dropped entirely (D17).
```

**Add a new task after 4.1:**

```
- [ ] 4.1a Client logo upload
      Upload field on the client screen (Administrator and Litigation Assistant).
      PNG / JPG / GIF, max 2 MB, resized to a sensible print width.
      Stored in the folder per D15. Preview before saving.
      A missing file must fall back to the client's name in text.
```
