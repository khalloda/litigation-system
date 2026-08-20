import { t } from '@/strings';
import styles from './page.module.css';

/* A real line break, kept out of the JSX so it is unmistakable. */
const NEWLINE = String.fromCharCode(10);

/*
 * Task 0.4 verification page. Temporary — the real dashboard replaces it in
 * Stage 5.
 *
 * Its job is to show, on screen, that the six things docs/BRAND.md requires
 * actually work: right-to-left layout, the bundled Arabic font, the brand
 * palette, mixed Arabic/Latin text, Western digits, and multi-line values
 * kept intact.
 *
 * Note there is not one piece of visible text written in this file — not
 * Arabic, and not English either. Everything a reader sees comes from
 * src/strings.ts (decision D12). The colour names used to live here, which
 * `npm run check:rtl` now refuses.
 */

/*
 * Hex codes and token names are values, not words, so they stay here. The
 * name beside each swatch is text a person reads, so it comes from strings.
 */
const palette = [
  { label: t.setupCheck.palette.primary, hex: '#214B4B', token: '--colour-primary' },
  { label: t.setupCheck.palette.primaryDark, hex: '#163232', token: '--colour-primary-dark' },
  { label: t.setupCheck.palette.primaryMid, hex: '#2B605C', token: '--colour-primary-mid' },
  { label: t.setupCheck.palette.accent, hex: '#46A398', token: '--colour-accent' },
  { label: t.setupCheck.palette.accentWarm, hex: '#B6AA92', token: '--colour-accent-warm' },
  {
    label: t.setupCheck.palette.accentWarmDark,
    hex: '#9C9174',
    token: '--colour-accent-warm-dark',
  },
  { label: t.setupCheck.palette.background, hex: '#EEEDE8', token: '--colour-background' },
  { label: t.setupCheck.palette.text, hex: '#1E1E1E', token: '--colour-text' },
  { label: t.setupCheck.palette.border, hex: '#C7C7C7', token: '--colour-border' },
  { label: t.setupCheck.palette.danger, hex: '#802F1C', token: '--colour-danger' },
];

export default function SetupCheck() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t.setupCheck.title}</h1>
        <p className={styles.subtitle}>{t.setupCheck.subtitle}</p>
      </header>

      <section className={styles.card}>
        <h2>{t.setupCheck.direction}</h2>
        <p className={styles.value}>{t.setupCheck.directionValue}</p>
        <p className={styles.note}>{t.setupCheck.logical}</p>
      </section>

      <section className={styles.card}>
        <h2>{t.setupCheck.font}</h2>
        <p className={styles.value}>{t.setupCheck.fontValue}</p>
      </section>

      <section className={styles.card}>
        <h2>{t.setupCheck.mixedText}</h2>
        <p className={styles.value}>{t.setupCheck.sampleClientName}</p>
        <p className={styles.note}>{t.setupCheck.digits}: 0 1 2 3 4 5 6 7 8 9</p>
      </section>

      <section className={styles.card}>
        <h2>{t.setupCheck.multiLine}</h2>
        <p className={`${styles.value} multiline`}>
          {t.setupCheck.sampleCaseNumbers.join(NEWLINE)}
        </p>
        <p className={styles.note}>{t.setupCheck.multiLineNote}</p>
      </section>

      <section className={styles.card}>
        <h2>{t.setupCheck.colours}</h2>
        <ul className={styles.swatches}>
          {palette.map((colour) => (
            <li key={colour.token} className={styles.swatch}>
              <div className={styles.chip} style={{ backgroundColor: colour.hex }} />
              <div className={styles.swatchLabel}>
                {colour.label}
                <br />
                <span className={styles.hex}>{colour.hex}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
