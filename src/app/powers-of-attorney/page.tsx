import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getPoas } from '@/lib/powers-of-attorney';
import { PoaFilterError, poaListHref, poaDetailHref } from '@/lib/poa-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { t } from '@/strings';
import { PoaFields } from './poa-fields';
import styles from '../staff/staff.module.css';
import local from './poa.module.css';
export const metadata = { title: t.poa.title };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ClientSearchParams>;
}) {
  const session = await requirePagePermission({ area: 'powersOfAttorney', action: 'view' });
  let data;
  try {
    data = await getPoas(session, await searchParams);
  } catch (e) {
    if (!(e instanceof PoaFilterError)) throw e;
    return (
      <main className={styles.page}>
        <h1>{t.poa.title}</h1>
        <p role="alert">{t.clients.invalidFilters}</p>
        <Link className={styles.link} href="/powers-of-attorney">
          {t.clients.clear}
        </Link>
      </main>
    );
  }
  const { rows, filters: f, options, total, pages } = data;
  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#poa-results">
        {t.poa.results}
      </a>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.app.system}</p>
          <h1>{t.poa.title}</h1>
          <p>{t.poa.listHint}</p>
        </div>
        <Link className={styles.link} href="/">
          {t.nav.dashboard}
        </Link>
        {hasPermission(session.user.role, 'powersOfAttorney', 'create') ? (
          <Link
            className={styles.link}
            href={'/powers-of-attorney/new' + poaListHref(f).slice('/powers-of-attorney'.length)}
          >
            {t.poa.create}
          </Link>
        ) : (
          <p>{t.poa.readOnly}</p>
        )}
      </header>
      <section className={styles.panel} aria-label={t.poa.search}>
        <form method="get" action="/powers-of-attorney">
          <div className={local.fields}>
            <div className={styles.field}>
              <label htmlFor="poa-q">{t.poa.search}</label>
              <input
                id="poa-q"
                name="q"
                defaultValue={f.q}
                maxLength={160}
                aria-describedby="poa-search-help"
              />
              <p id="poa-search-help" className={styles.hint}>
                {t.poa.searchHint}
              </p>
            </div>
            {(['client', 'lawyer'] as const).map((key) => (
              <div className={styles.field} key={key}>
                <label htmlFor={'poa-' + key}>
                  {key === 'client' ? t.poa.currentClient : t.poa.currentLawyers}
                </label>
                <select
                  id={'poa-' + key}
                  name={key}
                  defaultValue={new Map(Object.entries(f)).get(key)}
                >
                  <option value="all">{t.poa.all}</option>
                  <option value="missing">
                    {key === 'client' ? t.poa.missingClient : t.poa.noCurrent}
                  </option>
                  {options
                    .filter((o) => o.kind === key)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {o.archived ? ' · ' + t.poa.archived : ''}
                        {o.inactive ? ' · ' + t.poa.inactive : ''}
                        {o.kind === 'lawyer' && !o.staff ? ' · ' + t.poa.external : ''}
                      </option>
                    ))}
                </select>
              </div>
            ))}
            {(
              [
                [
                  'archive',
                  t.poa.archiveFilter,
                  [
                    ['current', t.poa.current],
                    ['archived', t.poa.archived],
                    ['all', t.poa.all],
                  ],
                ],
                [
                  'copies',
                  t.poa.copies,
                  [
                    ['all', t.poa.all],
                    ['zero', t.poa.zero],
                    ['positive', t.poa.positive],
                    ['unknown', t.poa.unknown],
                  ],
                ],
                [
                  'report',
                  t.poa.report,
                  [
                    ['all', t.poa.all],
                    ['shown', t.poa.shown],
                    ['hidden', t.poa.hidden],
                    ['unknown', t.poa.unknown],
                  ],
                ],
              ] as const
            ).map(([key, label, choices]) => (
              <div className={styles.field} key={key}>
                <label htmlFor={'poa-' + key}>{label}</label>
                <select
                  id={'poa-' + key}
                  name={key}
                  defaultValue={new Map(Object.entries(f)).get(key)}
                >
                  {choices.map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit">
              {t.common.search}
            </button>
            <Link className={styles.link} href="/powers-of-attorney">
              {t.clients.clear}
            </Link>
          </div>
        </form>
      </section>
      <section id="poa-results" className={styles.panel} aria-label={t.poa.results}>
        <h2>
          {t.poa.results} · {total}
        </h2>
        {data.clamped ? <p role="status">{t.poa.clamped}</p> : null}
        {!rows.length ? (
          <p>{t.poa.empty}</p>
        ) : (
          rows.map((r) => (
            <article key={r.id} className={local.card}>
              <h3>
                <Link className={styles.nameLink} href={poaDetailHref(r.id, f)}>
                  {r.principal ?? t.poa.unknown} · {r.id}
                </Link>
              </h3>
              <p>{r.archived ? t.poa.archived : t.poa.current}</p>
              <PoaFields record={r} />
            </article>
          ))
        )}
        <nav className={styles.pagination} aria-label={t.poa.page}>
          {f.page > 1 ? (
            <Link className={styles.link} href={poaListHref(f, f.page - 1)}>
              {t.poa.previous}
            </Link>
          ) : null}
          <p>
            {t.poa.page} {f.page} {t.poa.of} {pages} · {t.poa.total} {total}
          </p>
          {f.page < pages ? (
            <Link className={styles.link} href={poaListHref(f, f.page + 1)}>
              {t.poa.next}
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
