import type { ReportLabelPart } from '@/lib/reports/types';
import { reportLineDirection } from '@/lib/reports/label';
import { Fragment } from 'react';
import styles from './reports.module.css';

export function ReportLabelParts({ parts }: { parts: readonly ReportLabelPart[] }) {
  return (
    <span className={styles.labelParts}>
      {parts.map((part, index) => (
        <span key={index}>
          <span>{part.label}: </span>
          <bdi className={styles.labelValue}>
            {part.value.split('\n').map((line, i, lines) => (
              <Fragment key={i}>
                <bdi dir={reportLineDirection(line)}>{line}</bdi>
                {i < lines.length - 1 ? '\n' : null}
              </Fragment>
            ))}
          </bdi>
        </span>
      ))}
    </span>
  );
}
