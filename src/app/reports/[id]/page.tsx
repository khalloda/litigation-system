import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { reporting } from '@/lib/reports/production';
import { ReportError } from '@/lib/reports/types';
import { ReportForm } from '../report-form';
import { t } from '@/strings';
import styles from '../reports.module.css';
export const dynamic = 'force-dynamic';
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePagePermission({ area: 'reports', action: 'run' });
  const { id } = await params;
  let model;
  try {
    model = await reporting.describe(session, id);
  } catch (error) {
    if (error instanceof ReportError && error.code === 'unknown') notFound();
    throw error;
  }
  return (
    <main className={styles.page}>
      <Link href="/reports">{t.reports.back}</Link>
      <h1>{model.descriptor.title}</h1>
      <p>{model.descriptor.description}</p>
      <ReportForm {...model} />
    </main>
  );
}
