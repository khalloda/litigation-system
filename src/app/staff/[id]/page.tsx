import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { getStaff } from '@/lib/staff-roster';
import { t } from '@/strings';
import styles from '../staff.module.css';

export const metadata: Metadata = { title: t.staff.title };

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePagePermission({ area: 'staff', action: 'view' });
  const person = await getStaff(session, (await params).id);
  if (!person) notFound();
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.staff.title}</p>
          <h1>{person.nameAr}</h1>
          <p className={styles.state}>{person.isActive ? t.staff.active : t.staff.former}</p>
        </div>
        <div className={styles.actions}>
          {session.user.role === 'Administrator' ? (
            <Link className={styles.button} href={`/staff/${person.id}/edit`}>
              {t.staff.manage.edit}
            </Link>
          ) : null}
          <Link className={styles.link} href="/staff">
            {t.staff.back}
          </Link>
        </div>
      </header>
      <div className={styles.detailGrid}>
        <section className={styles.panel} aria-labelledby="staff-identity">
          <h2 id="staff-identity">{t.staff.identity}</h2>
          <dl className={styles.facts}>
            <div>
              <dt>{t.staff.name}</dt>
              <dd>{person.nameAr}</dd>
            </div>
            <div>
              <dt>{t.staff.englishName}</dt>
              <dd>
                {person.nameEn ? (
                  <bdi dir="ltr" className={styles.ltr}>
                    {person.nameEn}
                  </bdi>
                ) : (
                  t.common.notRecorded
                )}
              </dd>
            </div>
            <div>
              <dt>{t.staff.email}</dt>
              <dd>
                {person.email ? (
                  <bdi dir="ltr" className={styles.ltr}>
                    {person.email}
                  </bdi>
                ) : (
                  t.common.notRecorded
                )}
              </dd>
            </div>
            <div>
              <dt>{t.staff.trainee}</dt>
              <dd>{person.isTrainee ? t.staff.traineeYes : t.staff.traineeNo}</dd>
            </div>
          </dl>
        </section>
        <section className={styles.panel} aria-labelledby="staff-organization">
          <h2 id="staff-organization">{t.staff.organization}</h2>
          <dl className={styles.facts}>
            <div>
              <dt>{t.staff.team}</dt>
              <dd>{person.teamName ?? t.staff.unassigned}</dd>
            </div>
            <div>
              <dt>{t.staff.reviewer}</dt>
              <dd>
                {person.reviewer ? (
                  <Link className={styles.nameLink} href={`/staff/${person.reviewer.id}`}>
                    {person.reviewer.name}
                  </Link>
                ) : (
                  t.common.notRecorded
                )}
              </dd>
            </div>
            <div>
              <dt>{t.staff.reviews}</dt>
              <dd>
                {person.reviews.length
                  ? person.reviews.map((team) => <div key={team.id}>{team.name}</div>)
                  : t.common.none}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <section className={styles.panel} aria-labelledby="staff-aliases">
        <h2 id="staff-aliases">{t.staff.aliases}</h2>
        <p>{t.staff.aliasesHint}</p>
        <ul className={styles.aliasList}>
          {person.aliases.map((alias) => (
            <li key={alias.id}>
              <p>
                <strong>{alias.name}</strong>
              </p>
              <p className={styles.secondary}>
                {alias.isImported ? t.staff.imported : t.staff.applicationAlias}
              </p>
              <p>
                {alias.isPrimary
                  ? t.staff.primary
                  : alias.isRetired
                    ? t.staff.retired
                    : t.staff.searchable}
              </p>
              {alias.retirementReason ? (
                <p>
                  {t.staff.retirementReason}: {alias.retirementReason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {'account' in person ? (
        <section className={styles.panel} aria-labelledby="staff-account">
          <h2 id="staff-account">{t.staff.account}</h2>
          <p>
            {person.account
              ? person.account.isEnabled
                ? t.users.states.enabled
                : t.users.states.disabled
              : t.staff.noAccount}
          </p>
          <p>{t.staff.accountHint}</p>
          <Link className={styles.link} href="/users">
            {t.staff.accountLink}
          </Link>
        </section>
      ) : null}
    </main>
  );
}
