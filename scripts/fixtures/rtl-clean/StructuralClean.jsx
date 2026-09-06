/* DELIBERATELY CORRECT JavaScript component coverage. */
import { t } from '@/strings';

export function StructuralClean({ runtimeLabel, state }) {
  return (
    <section
      title={t.app.name}
      aria-label={t.app.system}
      className={`panel ${state}`}
      data-state="ready"
      id={'main-panel'}
    >
      {t /* multiline formatting around a safe strings reference */
        ? t.common.loading
        : runtimeLabel}
      <span>
        {t ? t.common.save : t.common.cancel}
      </span>
      <span>{'—'}</span>
      <span>{`1039 / 20`}</span>
    </section>
  );
}
