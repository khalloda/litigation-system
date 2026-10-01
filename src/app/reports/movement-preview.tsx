import { t } from '@/strings';
import type { ReportDescriptor } from '@/lib/reports/types';
import styles from './reports.module.css';

/** Printed blanks, never editable controls or stored movement data. */
export function MovementPreview({ descriptor }: { descriptor: ReportDescriptor }) {
  const manual = descriptor.manual;
  if (!manual?.kind) return null;
  return (
    <section aria-label={manual.heading} className={styles.movement}>
      <h3>{manual.heading}</h3>
      <p>{t.documentReports.blankNotice}</p>
      {manual.kind === 'poa-movement' ? (
        <div role="region" tabIndex={0} aria-label={manual.heading} className={styles.scroll}>
          <table>
            <thead>
              <tr>
                {manual.labels.map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 25 }, (_, i) => (
                <tr key={i}>
                  {manual.labels.map((label) => (
                    <td key={label} className={styles.writingBlank}></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        Array.from({ length: 3 }, (_, i) => (
          <section key={i} className={styles.movementPair}>
            <h4>
              {i + 1} — {t.documentReports.outgoing}
            </h4>
            <dl>
              {manual.labels.slice(0, 6).map((label) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={styles.writingBlank}></dd>
                </div>
              ))}
            </dl>
            <h4>
              {i + 1} — {t.documentReports.incoming}
            </h4>
            <dl>
              {manual.labels.slice(6).map((label) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={styles.writingBlank}></dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      )}
    </section>
  );
}
