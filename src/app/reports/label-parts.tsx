import type { ReportLabelPart } from '@/lib/reports/types';
import styles from './reports.module.css';

export function ReportLabelParts({ parts }: { parts: readonly ReportLabelPart[] }) {
  return (
    <span className={styles.labelParts}>
      {parts.map((part, index) => (
        <span key={index}>
          <span>{part.label}: </span>
          <bdi className={styles.labelValue}>{part.value}</bdi>
        </span>
      ))}
    </span>
  );
}
