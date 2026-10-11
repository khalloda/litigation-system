import type { FeeLetterScope } from '@/lib/fee-letter-query';
import { t } from '@/strings';
import local from '../powers-of-attorney/poa.module.css';
/** The exact approval text and original engagement stay beside the proceeding. */
export function FeeScope({ scope }: { scope: FeeLetterScope | null | undefined }) {
  if (!scope) return null;
  return (
    <section className={local.source} aria-label={t.feeScope.bounded}>
      <strong>{t.feeScope.bounded}</strong>
      <p>{t.feeScope.limitation}</p>
      <dl className={local.fields}>
        <div>
          <dt>{t.feeScope.proceeding}</dt>
          <dd className={local.value}>
            <bdi dir="ltr">{scope.covered_proceeding}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t.feeScope.originalWork}</dt>
          <dd className={local.value}>{scope.original_work}</dd>
        </div>
        <div>
          <dt>{t.feeScope.statement}</dt>
          <dd className={local.value} dir="auto">
            {scope.scope_statement}
          </dd>
        </div>
        <div>
          <dt>{t.feeScope.excluded}</dt>
          <dd className={local.value} dir="auto">
            {scope.excluded_stages}
          </dd>
        </div>
      </dl>
    </section>
  );
}
