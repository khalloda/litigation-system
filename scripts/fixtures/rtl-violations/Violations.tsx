/*
 * DELIBERATELY WRONG. Do not copy anything from this file, and do not import
 * it — it exists only so `npm run check:rtl --self-test` can prove the
 * checker still catches these.
 *
 * Every one of these slipped past the first version of the checker, which
 * looked only at stylesheets and only for Arabic text.
 */

export function Violations() {
  return (
    <div>
      {/* Physical directions written inline, which were not examined at all. */}
      <p style={{ marginLeft: 8 }}>one</p>
      <p style={{ paddingRight: 12 }}>two</p>
      <p style={{ borderLeftWidth: 4 }}>three</p>
      <p style={{ position: 'absolute', left: 0 }}>four</p>
      <p style={{ textAlign: 'right' }}>five</p>

      {/* Text a user reads, sitting in a prop instead of src/strings.ts. */}
      <img src="/x.png" alt="Company logo" />

      {/* Text a user reads, sitting between tags. */}
      <h1>Client status report</h1>

      {/* Arabic between tags is the case the original checker did catch. */}
      <h2>تقرير حالة العميل</h2>
    </div>
  );
}

/*
 * A table of data defined inside a component. The `name` values are displayed,
 * so they are interface text — this is the exact shape that hid English
 * colour names on our own verification page.
 */
export const palette = [
  { name: 'Emerald Green', hex: '#214B4B' },
  { name: 'Terracotta Red', hex: '#802F1C' },
];

// A raw colour in a component. The check must catch this.
export function Swatch() {
  return <span style={{ backgroundColor: '#0F6E56' }} />;
}
