'use client';
import { useState } from 'react';
import { t } from '@/strings';
import { reportSearchText } from '@/lib/reports/search';
import type { ParameterRule, ReportOption } from '@/lib/reports/types';

export function ReportReferenceSelect({
  id,
  name,
  label,
  rule,
  options,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  label: string;
  rule: ParameterRule;
  options: readonly ReportOption[];
  invalid: boolean;
  describedBy: string;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const matches = options.filter(
    (x) =>
      String(x.id) === selected || reportSearchText(x.label).includes(reportSearchText(search)),
  );
  return (
    <>
      <label htmlFor={`${id}-search`}>
        {t.reports.searchOptions} — {label}
      </label>
      <input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-describedby={`${id}-search-help`}
      />
      <p id={`${id}-search-help`}>{t.reports.searchHelp}</p>
      <select
        id={id}
        name={name}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        aria-required={rule.required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      >
        <option value="">{rule.required ? t.reports.required : t.reports.all}</option>
        {rule.unassigned ? <option value="unassigned">{t.reports.unassigned}</option> : null}
        {matches.map((x) => (
          <option key={x.id} value={String(x.id)}>
            {x.label}
          </option>
        ))}
      </select>
      <p aria-live="polite">
        {t.reports.optionCount}: <bdi>{matches.length}</bdi>
      </p>
    </>
  );
}
