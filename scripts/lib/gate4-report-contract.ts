export const GATE4_CLIENT_LEGACY_ID = '3';
export const GATE4_LAWYER_PARAMETER = 'مؤمن سليم';
export const GATE4_FROM_DATE = '2009-01-01';
export const GATE4_TO_DATE = '2026-12-31';

export const GATE4_REPORT_FIELDS = Object.freeze({
  clientMatters: [
    'legacy_id',
    'case_number_ar',
    'subject',
    'status',
    'client_legacy_id',
    'branch_raw',
    'category_raw',
    'court_raw',
  ],
  forAgainst: ['legacy_id', 'hearing_date', 'matter_legacy_id', 'outcome', 'decision'],
  lawyerWorkload: ['matter_legacy_id', 'case_number_ar', 'status', 'lawyer_a_raw'],
  hearingsByDate: [
    'legacy_id',
    'hearing_date',
    'next_hearing_date',
    'matter_legacy_id',
    'decision',
    'previous_decision',
    'outcome',
    'action_raw',
    'court_raw',
    'circuit_raw',
    'destination_raw',
    'notes_raw',
    'client_notified',
  ],
  adminWorks: [
    'legacy_id',
    'matter_legacy_id',
    'required_work',
    'assignee_raw',
    'task_created_date',
    'execution_date',
    'result',
    'previous_decision',
    'last_followup',
    'deadline',
    'court_raw',
    'circuit_raw',
    'destination_raw',
    'status',
    'alert',
  ],
  financial: [
    'kind',
    'legacy_id',
    'reference',
    'date',
    'amount_1',
    'amount_2',
    'currency',
    'currency_raw',
    'details',
    'status',
    'type',
    'flag_1',
    'flag_2',
    'extra_1',
    'extra_2_raw',
  ],
} as const);

export type Gate4QuarantineKeys = Readonly<{
  matter: ReadonlySet<string>;
  hearing: ReadonlySet<string>;
  adminTask: ReadonlySet<string>;
  invoice: ReadonlySet<string>;
  payment: ReadonlySet<string>;
}>;

export type Gate4CurrencyRule = Readonly<{
  fieldKind: string;
  sourceValue: string;
  targetValue: string | null;
  requireZeroAmount: boolean;
}>;

export const GATE4_REPORT_CONTRACTS: readonly (readonly [string, string, string, string])[] = [
  [
    'client matters',
    'rptClientMatters1 — direct clients/matters/hearings record source',
    'client legacy ID 3; transformed matter population',
    'one row per durable matter identity',
  ],
  [
    'judgments for/against',
    'rptJudgmentsForAgainst — direct matter/hearing outcome record source',
    '2009-01-01 through 2026-12-31; non-NULL outcome',
    'durable hearing identity',
  ],
  [
    'lawyer workload',
    'إحصائية أعداد الدعاوى لكل محامي أ — saved lawyerA LIKE query',
    'مؤمن سليم; active; lawyerA only',
    'one row per durable matter identity',
  ],
  [
    'hearings by date',
    'rptHearingsBetween2Dates — direct matter/hearing record source',
    '2009-01-01 through 2026-12-31',
    'durable hearing identity',
  ],
  [
    'administrative works',
    'أعمال إدارية جميع الجهات -جديد — direct clients/matters/tasks/actions/hearings source',
    'all transformed legacy administrative tasks',
    'durable task identity; task_created_date, never created_at',
  ],
  [
    'financial history',
    'الفواتير المحصلة -بدون تقسيم / الفواتير المحصلة حسب التاريخ',
    'all transformed legacy invoices and payments; reviewed D3 contractID link',
    'kind then durable billing identity',
  ],
] as const;
