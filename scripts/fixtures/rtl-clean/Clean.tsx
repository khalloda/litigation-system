/*
 * DELIBERATELY CORRECT. The self-test asserts this file produces no findings,
 * so that the checker cannot pass by simply complaining about everything.
 */

import { t } from '@/strings';

/* Technical values that happen to be strings are not interface text. */
const tokens = [
  { name: '--colour-primary', hex: '#214B4B' },
  { name: '--colour-danger', hex: '#802F1C' },
];

export function Clean() {
  return (
    <div>
      {/* Inline styles that carry no direction. */}
      <p style={{ marginInlineStart: 8 }}>{t.common.total}</p>
      <p style={{ backgroundColor: '#214B4B' }}>{t.common.search}</p>
      <p style={{ marginTop: 4, paddingBlock: 8 }}>{t.common.print}</p>

      {/* Every visible string comes from src/strings.ts. */}
      <h1>{t.app.system}</h1>
      <img src="/logo.png" alt={t.app.name} />

      {/* Punctuation and digits between tags are not interface text. */}
      <span>—</span>
      <span>0 1 2 3</span>

      {/*
        A template literal in className is a machine value, not a label. This
        was briefly reported as visible text; it is here so it stays fixed.
      */}
      <span className={`${'chip'} multiline`}>{t.common.none}</span>
      <div id={'main-panel'} role={'region'}>
        {t.common.loading}
      </div>

      {/* Symmetrical and short shorthands carry no direction. */}
      <p style={{ margin: '0 8px 0 8px' }}>{t.common.save}</p>
      <p style={{ padding: '4px 8px' }}>{t.common.cancel}</p>

      {tokens.map((token) => (
        <span key={token.name}>{token.hex}</span>
      ))}
    </div>
  );
}
