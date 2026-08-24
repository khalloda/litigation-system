# Bundled fonts

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
