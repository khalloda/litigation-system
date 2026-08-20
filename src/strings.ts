/**
 * Every visible string in the application.
 *
 * Nothing the user can read is written inside a component — decision D12 and
 * docs/BRAND.md. The application is Arabic only and there is no translation
 * library, because one language does not need one. This file is what keeps a
 * second language a mechanical job later rather than an excavation.
 *
 * Rules:
 *   - Arabic here, never in a .tsx file.
 *   - Group by screen or feature, so a translator sees related text together.
 *   - Western digits (0-9). Confirmed: zero Arabic-Indic digits in all 35,343
 *     rows of the real data. Search still accepts ٠-٩ typed by a user.
 *   - Legal terms come from docs/GLOSSARY.md. Never invent one.
 */

export const t = {
  app: {
    name: 'ساري الدين وشركاه',
    system: 'نظام إدارة الدعاوى',
  },

  // Main navigation. Order follows how the firm works, not the database.
  nav: {
    dashboard: 'الرئيسية',
    clients: 'العملاء',
    matters: 'الدعاوى',
    hearings: 'الجلسات',
    adminWorks: 'الأعمال الإدارية',
    powersOfAttorney: 'التوكيلات',
    documents: 'المستندات',
    feeLetters: 'خطابات الأتعاب',
    billing: 'الفواتير والسداد',
    reports: 'التقارير',
    staff: 'فريق العمل',
    users: 'المستخدمون',
    settings: 'الإعدادات',
  },

  // Words that appear on many screens.
  common: {
    search: 'بحث',
    add: 'إضافة',
    edit: 'تعديل',
    save: 'حفظ',
    cancel: 'إلغاء',
    close: 'إغلاق',
    print: 'طباعة',
    exportExcel: 'تصدير إلى Excel',
    exportPdf: 'تصدير إلى PDF',
    from: 'من',
    to: 'إلى',
    total: 'الإجمالي',
    none: 'لا يوجد',
    notRecorded: 'غير مسجل',
    unassigned: 'غير محدد',
    loading: 'جارٍ التحميل…',
    noResults: 'لا توجد نتائج',
  },

  // Field labels shared across screens. Terms from docs/GLOSSARY.md.
  fields: {
    caseNumber: 'رقم الدعوى',
    subject: 'موضوع الدعوى',
    client: 'العميل',
    opponent: 'الخصم',
    court: 'المحكمة',
    circuit: 'الدائرة',
    destination: 'الجهة',
    status: 'الموقف الحالي',
    lawyer: 'المحامي',
    hearingDate: 'تاريخ الجلسة',
    nextHearingDate: 'تاريخ الجلسة القادمة',
    decision: 'القرار',
    lastDecision: 'آخر قرار',
    attendees: 'الحاضرون',
    notes: 'ملاحظات',
  },

  // Fixed values that exist in the data. Editable lookups live in the
  // database, not here — see D8.
  values: {
    active: 'سارية',
    closed: 'منتهية',
    for: 'صالح',
    against: 'ضد',
  },

  errors: {
    generic: 'حدث خطأ. يرجى المحاولة مرة أخرى.',
    notFound: 'الصفحة غير موجودة',
    forbidden: 'ليس لديك صلاحية للاطلاع على هذه الصفحة',
  },

  // Temporary — the task 0.4 proof page. Removed when real screens arrive.
  setupCheck: {
    title: 'التخطيط العربي من اليمين إلى اليسار',
    subtitle: 'صفحة تحقق مؤقتة — المهمة 0.4',
    direction: 'الاتجاه',
    directionValue: 'من اليمين إلى اليسار',
    font: 'الخط',
    fontValue: 'Noto Naskh Arabic',
    colours: 'ألوان العلامة',
    mixedText: 'نص مختلط الاتجاه',
    multiLine: 'رقم دعوى متعدد الأسطر',
    multiLineNote: 'يجب أن تظهر الأسطر الثلاثة كاملة',
    digits: 'الأرقام تبقى غربية',
    logical: 'الحاشية الداخلية تتبع اتجاه الصفحة',

    // Display fixtures for this page. A mixed Arabic/Latin name, and several
    // case numbers stacked the way 18% of matters hold them — the matter's
    // journey up through the courts. Never split, never collapsed (D9).
    sampleClientName: 'شركة هيوليت باكارد HP',
    sampleCaseNumbers: ['83066 / 69ق', '10714 / 72ق', '9239 / 72ق'],

    // Colour names displayed beside each swatch. They are interface text, so
    // they live here and not in the component — the hex codes stay in the
    // component because they are values, not words.
    palette: {
      primary: 'Emerald Green',
      primaryDark: 'Dark Emerald',
      primaryMid: 'Primary mid',
      accent: 'Teal',
      accentWarm: 'Light Gold',
      accentWarmDark: 'Gold dark',
      background: 'Off-white',
      text: 'Charcoal',
      border: 'Border',
      danger: 'Terracotta Red',
    },
  },
} as const;
