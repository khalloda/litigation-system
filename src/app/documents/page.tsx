import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getDocuments } from '@/lib/documents';
import { DocumentFilterError, documentListHref, documentDetailHref } from '@/lib/document-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { DocumentFields } from './document-fields';
import styles from '../staff/staff.module.css';
import local from '../powers-of-attorney/poa.module.css';
export const metadata = { title: t.documentsModule.title };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'documents', action: 'view' });
  const params = await searchParams;
  let data;
  try {
    data = await getDocuments(session, params);
  } catch (e) {
    if (!(e instanceof DocumentFilterError)) throw e;
    return (
      <main className={styles.page}>
        <h1>{t.documentsModule.title}</h1>
        <p role="alert">{t.documentsModule.errors.invalid}</p>
        <Link href="/documents">{t.documentsModule.clear}</Link>
      </main>
    );
  }
  const { rows, filters: f, options, total, pages } = data;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.app.system}</p>
          <h1>{t.documentsModule.title}</h1>
          <p>{t.documentsModule.listHint}</p>
        </div>
        <Link className={styles.link} href="/">
          {t.nav.dashboard}
        </Link>
        {hasPermission(session.user.role, 'documents', 'create') ? (
          <Link
            className={styles.link}
            href={'/documents/new' + documentListHref(f).slice('/documents'.length)}
          >
            {t.documentsModule.create}
          </Link>
        ) : (
          <p>{t.documentsModule.readOnly}</p>
        )}
      </header>
      <section className={styles.panel}>
        <form method="get" action="/documents">
          <div className={local.fields}>
            <div className={styles.field}>
              <label htmlFor="doc-q">{t.documentsModule.search}</label>
              <input id="doc-q" name="q" defaultValue={f.q} maxLength={160} />
              <p className={styles.hint}>{t.documentsModule.searchHint}</p>
            </div>
            {(['client', 'matter', 'person'] as const).map((key) => (
              <div className={styles.field} key={key}>
                <label htmlFor={'doc-' + key}>
                  {key === 'client'
                    ? t.documentsModule.currentClient
                    : key === 'matter'
                      ? t.documentsModule.currentMatter
                      : t.documentsModule.responsible}
                </label>
                <select
                  id={'doc-' + key}
                  name={key}
                  defaultValue={new Map(Object.entries(f)).get(key)}
                >
                  <option value="all">{t.documentsModule.all}</option>
                  <option value="missing">{t.documentsModule.missing}</option>
                  {options
                    .filter((o) => o.kind === key)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {o.archived ? ' · ' + t.documentsModule.archived : ''}
                      </option>
                    ))}
                </select>
              </div>
            ))}
            <div className={styles.field}>
              <label htmlFor="doc-archive">{t.documentsModule.archiveFilter}</label>
              <select id="doc-archive" name="archive" defaultValue={f.archive}>
                <option value="current">{t.documentsModule.current}</option>
                <option value="archived">{t.documentsModule.archived}</option>
                <option value="all">{t.documentsModule.all}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="doc-mfiles">{t.documentsModule.mfilesFilter}</label>
              <select id="doc-mfiles" name="mfiles" defaultValue={f.mfiles}>
                <option value="all">{t.documentsModule.all}</option>
                <option value="present">{t.documentsModule.present}</option>
                <option value="missing">{t.documentsModule.missing}</option>
              </select>
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit">
              {t.common.search}
            </button>
            <Link className={styles.link} href="/documents">
              {t.documentsModule.clear}
            </Link>
          </div>
        </form>
      </section>
      <section className={styles.panel}>
        <h2>
          {t.documentsModule.results} · {total}
        </h2>
        {data.clamped ? <p>{t.documentsModule.clamped}</p> : null}
        {rows.length ? (
          rows.map((r) => (
            <article className={local.card} key={r.id}>
              <h3>
                <Link className={styles.nameLink} href={documentDetailHref(r.id, f)}>
                  {r.description ?? t.documentsModule.unknown}
                </Link>
              </h3>
              <p>{r.archived ? t.documentsModule.archived : t.documentsModule.current}</p>
              <DocumentFields record={r} />
            </article>
          ))
        ) : (
          <p>{t.documentsModule.empty}</p>
        )}
        <nav className={styles.pagination} aria-label={t.documentsModule.results}>
          {f.page > 1 ? (
            <Link className={styles.link} href={documentListHref(f, f.page - 1)}>
              {t.documentsModule.previous}
            </Link>
          ) : null}
          <p>
            {t.documentsModule.page} {f.page} {t.documentsModule.of} {pages} ·{' '}
            {t.documentsModule.total} {total}
          </p>
          {f.page < pages ? (
            <Link className={styles.link} href={documentListHref(f, f.page + 1)}>
              {t.documentsModule.next}
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
