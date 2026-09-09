import type { ReactNode } from 'react';
import { t } from '@/strings';
export function classificationLabel(value: string | null) {
  return value === 'Cash'
    ? t.clients.cash
    : value === 'Probono' || value === 'probono'
      ? t.clients.probono
      : value?.trim()
        ? value
        : t.common.notRecorded;
}
export function statusLabel(value: string | null) {
  return value === 'Active'
    ? t.clients.active
    : value === 'Disabled'
      ? t.clients.disabled
      : value === 'Potential'
        ? t.clients.potential
        : value?.trim()
          ? value
          : t.common.notRecorded;
}
export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd dir="auto">
        {typeof value === 'string'
          ? value.trim()
            ? value
            : t.common.notRecorded
          : (value ?? t.common.notRecorded)}
      </dd>
    </div>
  );
}
