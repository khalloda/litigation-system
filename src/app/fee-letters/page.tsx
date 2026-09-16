import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getFeeLetters } from '@/lib/fee-letters';
import {
  FeeLetterFilterError,
  feeLetterListHref,
  feeLetterDetailHref,
} from '@/lib/fee-letter-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { FeeLetterFields } from './fee-letter-fields';
import { ListFilterClear } from '../list-filter-clear';
import styles from '../staff/staff.module.css';
import local from '../powers-of-attorney/poa.module.css';
export const metadata = { title: t.feeLettersModule.title };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'feeLetters', action: 'view' });
  const params = await searchParams;
  let data;
  try {
    data = await getFeeLetters(session, params);
  } catch (e) {
    if (!(e instanceof FeeLetterFilterError)) throw e;
    return (
      <main className={styles.page}>
        <h1>{t.feeLettersModule.title}</h1>
        <p role="alert">{t.feeLettersModule.errors.invalid}</p>
        <Link href="/fee-letters">{t.feeLettersModule.clear}</Link>
      </main>
    );
  }
  const { rows, filters: f, options, total, pages } = data;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.app.system}</p>
          <h1>{t.feeLettersModule.title}</h1>
          <p>{t.feeLettersModule.listHint}</p>
        </div>
        <Link className={styles.link} href="/">
          {t.nav.dashboard}
        </Link>
        {hasPermission(session.user.role, 'feeLetters', 'create') ? (
          <Link
            className={styles.link}
            href={'/fee-letters/new' + feeLetterListHref(f).slice('/fee-letters'.length)}
          >
            {t.feeLettersModule.create}
          </Link>
        ) : (
          <p>{t.feeLettersModule.readOnly}</p>
        )}
      </header>
      <section className={styles.panel}>
        <form
          key={JSON.stringify(params)}
          method="get"
          action="/fee-letters"
          data-filter-form="/fee-letters"
        >
          <div className={local.fields}>
            <div className={styles.field}>
              <label htmlFor="fee-q">{t.feeLettersModule.search}</label>
              <input id="fee-q" name="q" defaultValue={f.q} maxLength={160} />
              <p className={styles.hint}>{t.feeLettersModule.searchHint}</p>
            </div>
            {(['client', 'covered', 'referencing'] as const).map((key) => (
              <div className={styles.field} key={key}>
                <label htmlFor={'fee-' + key}>
                  {key === 'client'
                    ? t.feeLettersModule.client
                    : key === 'covered'
                      ? t.feeLettersModule.coveredFilter
                      : t.feeLettersModule.referencingFilter}
                </label>
                <select
                  id={'fee-' + key}
                  name={key}
                  defaultValue={new Map(Object.entries(f)).get(key)}
                >
                  <option value="all">{t.feeLettersModule.all}</option>
                  <option value="missing">{t.feeLettersModule.missing}</option>
                  {options
                    .filter((o) => o.kind === (key === 'client' ? 'client' : 'matter'))
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {o.archived ? ' · ' + t.feeLettersModule.archived : ''}
                      </option>
                    ))}
                </select>
              </div>
            ))}
            <div className={styles.field}>
              <label htmlFor="fee-archive">{t.feeLettersModule.archiveFilter}</label>
              <select id="fee-archive" name="archive" defaultValue={f.archive}>
                <option value="current">{t.feeLettersModule.current}</option>
                <option value="archived">{t.feeLettersModule.archived}</option>
                <option value="all">{t.feeLettersModule.all}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="fee-mfiles">{t.feeLettersModule.mfilesFilter}</label>
              <select id="fee-mfiles" name="mfiles" defaultValue={f.mfiles}>
                <option value="all">{t.feeLettersModule.all}</option>
                <option value="present">{t.feeLettersModule.present}</option>
                <option value="missing">{t.feeLettersModule.missing}</option>
              </select>
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit">
              {t.common.search}
            </button>
            <ListFilterClear
              className={styles.link}
              href="/fee-letters"
              label={t.feeLettersModule.clear}
              defaults={{
                q: '',
                client: 'all',
                covered: 'all',
                referencing: 'all',
                archive: 'current',
                mfiles: 'all',
              }}
            />
          </div>
        </form>
      </section>
      <section className={styles.panel}>
        <h2>
          {t.feeLettersModule.results} · {total}
        </h2>
        {data.clamped ? <p>{t.feeLettersModule.clamped}</p> : null}
        {rows.length ? (
          rows.map((r) => (
            <article className={local.card} key={r.id}>
              <h3>
                <Link className={styles.nameLink} href={feeLetterDetailHref(r.id, f)}>
                  {r.contractId ?? r.id} · {r.clientName ?? t.feeLettersModule.unknown}
                </Link>
              </h3>
              <p>{r.archived ? t.feeLettersModule.archived : t.feeLettersModule.current}</p>
              <FeeLetterFields record={r} />
            </article>
          ))
        ) : (
          <p>{t.feeLettersModule.empty}</p>
        )}
        <nav className={styles.pagination} aria-label={t.feeLettersModule.results}>
          {f.page > 1 ? (
            <Link className={styles.link} href={feeLetterListHref(f, f.page - 1)}>
              {t.feeLettersModule.previous}
            </Link>
          ) : null}
          <p>
            {t.feeLettersModule.page} {f.page} {t.feeLettersModule.of} {pages} ·{' '}
            {t.feeLettersModule.total} {total}
          </p>
          {f.page < pages ? (
            <Link className={styles.link} href={feeLetterListHref(f, f.page + 1)}>
              {t.feeLettersModule.next}
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
