# Bundled fonts

## UI Implementation 01 candidate — 28 September 2026

The owner adopted Noto Sans Arabic 2.012 for the UI and all PDF paths, including
audit exports. This supersedes the earlier Naskh choice only for this candidate.
The typography change is not activated or accepted. **PDF Unicode search/copy
verification remains unresolved; visual shaping alone is not a passed gate.**

The complete official variable TTF supplies UI weights 100–900. The PDF renderer
uses genuine static instances at 400/600/700, avoiding Chromium's Type3 embedding
of the variable source. FontTools 4.63.0 instantiated the supplied official font
with `wdth=100`, each `wght`, and `updateFontNames=True`. Source commit, original
and derived byte identities, coverage and font timestamps are recorded in
`noto-sans-arabic-provenance.json`. The SIL licence is `OFL-NotoSansArabic.txt`.
No runtime dependency or external font service was added. The existing approved
logo/emblem pixels remain unchanged.

UI CSS/preload and both Chromium PDF paths load local assets. Report assets require
an absolute deployment-owned `REPORT_ASSET_ROOT`, regular non-symlink files,
size/signature checks, exact derived-font SHA256 and decoded logos. Loaded faces
are checked before generating a PDF. Body/table text remains text.

## Retained historical font assets

**Noto Naskh Arabic** (variable, weights 400–700), served from this folder.

Bundled deliberately, never from a CDN. Two reasons, both from
`docs/BRAND.md`:

1. The PDF renderer runs on a server with no fonts installed. If the font is
   not bundled, every Arabic letter in a printed report becomes an empty box.
2. Font delivery must not depend on an unrelated external service. A CDN font
   request tells a third party which pages are being opened and stops working
   if the office loses its internet connection.

Three subsets are included — Arabic, Latin and Latin Extended. Latin is needed
because the data is genuinely mixed: `شركة هيوليت باكارد HP`, `1039 / 20ق`.
The maths and symbols subsets that ship with the package are not included;
nothing here uses them.

Licence: SIL Open Font License 1.1 — see `LICENSE-Noto-Naskh-Arabic.txt`.
Copyright 2022 The Noto Project Authors.

The files come from the npm package `@fontsource-variable/noto-naskh-arabic`.
To refresh them after upgrading that package, re-copy from
`node_modules/@fontsource-variable/noto-naskh-arabic/files/`.
