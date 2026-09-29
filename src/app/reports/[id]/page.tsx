import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { reporting } from '@/lib/reports/production';
import { ReportError } from '@/lib/reports/types';
import { ReportForm } from '../report-form';
import { t } from '@/strings';
import styles from '../reports.module.css';
import { reportClientContext } from '@/lib/reports/client-context';
export const dynamic = 'force-dynamic';
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ client?: string | string[] }>;
}) {
  const session = await requirePagePermission({ area: 'reports', action: 'run' });
  const { id } = await params;
  let model;
  try {
    model = await reporting.describe(session, id);
  } catch (error) {
    if (error instanceof ReportError && error.code === 'unknown') notFound();
    throw error;
  }
  const context = reportClientContext((await searchParams).client);
  const initialClient =
    model.descriptor.parameters.client &&
    model.options.client.some((option) => option.id === context)
      ? String(context)
      : '';
  return (
    <main className={styles.page} data-reviewed>
      <Link href={initialClient ? `/reports?client=${initialClient}` : '/reports'}>
        {t.reports.back}
      </Link>
      <h1>{model.descriptor.title}</h1>
      <p>{model.descriptor.description}</p>
      <ReportForm key={`${id}:${initialClient}`} {...model} initialClient={initialClient} />
    </main>
  );
}
