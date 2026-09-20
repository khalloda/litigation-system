import Link from 'next/link';
import type { Session } from 'next-auth';
import { AuditRecordEntry } from '@/app/audit-history/record-entry';
import { t } from '@/strings';
import type { PoaRecord, PoaLawyer } from '@/lib/poa-query';
import styles from '../staff/staff.module.css';
import local from './poa.module.css';
export function PoaValue({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={local.value}>{value ?? t.poa.unknown}</dd>
    </div>
  );
}
export function PoaMembers({
  members,
  empty,
  session,
}: {
  members: PoaLawyer[];
  empty: string;
  session?: Session;
}) {
  return members.length ? (
    <ul className={local.members}>
      {members.map((m) => (
        <li key={m.id}>
          {session ? (
            <AuditRecordEntry session={session} table="power_of_attorney_lawyers" id={m.id} />
          ) : null}
          {m.staff ? (
            <Link className={styles.nameLink} href={'/staff/' + m.personId}>
              {m.name}
            </Link>
          ) : (
            m.name
          )}
          {!m.staff ? <span> · {t.poa.external}</span> : null}
          {!m.active ? <span> · {t.poa.inactive}</span> : null}
        </li>
      ))}
    </ul>
  ) : (
    <p>{empty}</p>
  );
}
export function PoaFields({
  record: r,
  full = false,
  session,
}: {
  record: PoaRecord;
  full?: boolean;
  session?: Session;
}) {
  return (
    <>
      <dl className={local.fields}>
        <PoaValue label={t.poa.technicalId} value={r.id} />
        <PoaValue label={t.poa.principal} value={r.principal} />
        <PoaValue
          label={t.poa.reference}
          value={
            [r.number, r.letter, r.year].filter((v) => v !== null && v !== '').join(' / ') || null
          }
        />
        <div>
          <dt>{t.poa.currentClient}</dt>
          <dd className={local.value}>
            {r.clientId ? (
              <Link className={styles.nameLink} href={'/clients/' + r.clientId}>
                {r.clientName ?? t.poa.unknown}
              </Link>
            ) : (
              t.poa.unknown
            )}
            {r.clientArchived ? <p>{t.poa.parentArchived}</p> : null}
          </dd>
        </div>
        <div className={r.copies === 0 ? local.zero : undefined}>
          <dt>{t.poa.copies}</dt>
          <dd className={local.value}>
            {r.copies ?? t.poa.unknown}
            {r.copies === 0 ? <p>{t.poa.zero}</p> : null}
          </dd>
        </div>
        <PoaValue
          label={t.poa.report}
          value={r.report === null ? t.poa.unknown : r.report ? t.poa.shown : t.poa.hidden}
        />
        {full ? (
          <>
            <PoaValue label={t.poa.serial} value={r.serial} />
            <PoaValue label={t.poa.capacity} value={r.capacity} />
            <PoaValue label={t.poa.number} value={r.number} />
            <PoaValue label={t.poa.letter} value={r.letter} />
            <PoaValue label={t.poa.year} value={r.year} />
            <PoaValue label={t.poa.issuer} value={r.issuer} />
            <PoaValue label={t.poa.issueDate} value={r.issueDate} />
            <PoaValue label={t.fields.notes} value={r.notes} />
          </>
        ) : null}
      </dl>
      <h3>{t.poa.currentLawyers}</h3>
      <PoaMembers
        members={r.lawyers.filter((m) => !m.retired)}
        empty={t.poa.noCurrent}
        session={session}
      />
      {!r.lawyers.some((m) => !m.retired) ? (
        <p className={styles.hint}>{t.poa.noCurrentHint}</p>
      ) : null}
      {r.aliasMatches.length ? (
        <p>
          {t.poa.matches} {r.aliasMatches.join('، ')}
        </p>
      ) : null}
      <section className={local.source} aria-label={t.poa.source}>
        <dl className={local.fields}>
          <PoaValue label={t.poa.sourceClient} value={r.sourceClient} />
          <PoaValue label={t.poa.sourceLawyers} value={r.sourceLawyers} />
        </dl>
        {full ? (
          <>
            <h3>{t.poa.originalLawyers}</h3>
            <PoaMembers
              members={r.lawyers.filter((m) => m.original)}
              empty={t.poa.noOriginal}
              session={session}
            />
            <h3>{t.poa.retiredLawyers}</h3>
            <PoaMembers
              members={r.lawyers.filter((m) => m.retired)}
              empty={t.poa.unknown}
              session={session}
            />
          </>
        ) : null}
      </section>
    </>
  );
}
