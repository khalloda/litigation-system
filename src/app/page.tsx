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
 * Note there is not one Arabic string in this file. Everything visible comes
 * from src/strings.ts — decision D12.
 */

const palette = [
  { name: 'Emerald Green', hex: '#214B4B', token: '--colour-primary' },
  { name: 'Dark Emerald', hex: '#163232', token: '--colour-primary-dark' },
  { name: 'Primary mid', hex: '#2B605C', token: '--colour-primary-mid' },
  { name: 'Teal', hex: '#46A398', token: '--colour-accent' },
  { name: 'Light Gold', hex: '#B6AA92', token: '--colour-accent-warm' },
  { name: 'Gold dark', hex: '#9C9174', token: '--colour-accent-warm-dark' },
  { name: 'Off-white', hex: '#EEEDE8', token: '--colour-background' },
  { name: 'Charcoal', hex: '#1E1E1E', token: '--colour-text' },
  { name: 'Border', hex: '#C7C7C7', token: '--colour-border' },
  { name: 'Terracotta Red', hex: '#802F1C', token: '--colour-danger' },
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
                {colour.name}
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
