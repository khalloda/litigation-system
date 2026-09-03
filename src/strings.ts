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
    name: 'سري الدين وشركاه',
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

  auth: {
    loginTitle: 'تسجيل الدخول',
    loginSubtitle: 'استخدم اسم المستخدم وكلمة المرور الخاصة بك',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    rememberMe: 'تذكرني لمدة 7 أيام',
    normalSessionNote: 'بدون هذا الاختيار تنتهي الجلسة بعد 8 ساعات',
    submit: 'دخول',
    submitting: 'جارٍ التحقق…',
    invalidCredentials: 'تعذر تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى.',
    passwordChangedStatus: 'تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.',
    changeTitle: 'تغيير كلمة المرور',
    changeSubtitle: 'يجب تغيير كلمة المرور المؤقتة قبل متابعة استخدام النظام',
    currentPassword: 'كلمة المرور الحالية',
    newPassword: 'كلمة المرور الجديدة',
    confirmPassword: 'تأكيد كلمة المرور الجديدة',
    passwordPolicy: 'يجب ألا تقل كلمة المرور عن 12 حرفاً. يمكن استخدام المسافات والحروف العربية.',
    changeSubmit: 'حفظ كلمة المرور الجديدة',
    changing: 'جارٍ الحفظ…',
    passwordMismatch: 'كلمتا المرور الجديدتان غير متطابقتين.',
    passwordTooShort: 'يجب ألا تقل كلمة المرور الجديدة عن 12 حرفاً.',
    passwordReused: 'يجب أن تختلف كلمة المرور الجديدة عن كلمة المرور المؤقتة.',
    passwordChangeFailed: 'تعذر تغيير كلمة المرور. تحقق من كلمة المرور الحالية وحاول مرة أخرى.',
    signedInTitle: 'تم تسجيل الدخول',
    signedInAs: 'المستخدم',
    role: 'الدور',
    logout: 'تسجيل الخروج',
    logoAlt: 'سري الدين وشركاه — مستشارون قانونيون',
    passwordAdmin: {
      usage: 'الاستخدام: npm run auth:set-password -- Username',
      ttyRequired: 'يجب تشغيل هذا الأمر مباشرة من طرفية تفاعلية.',
      firstPrompt: 'أدخل كلمة المرور المؤقتة: ',
      secondPrompt: 'أعد إدخال كلمة المرور المؤقتة: ',
      mismatch: 'كلمتا المرور غير متطابقتين.',
      policy: 'يجب ألا تقل كلمة المرور عن 12 حرفاً.',
      success: 'تم تعيين كلمة المرور المؤقتة وإبطال الجلسات السابقة للحساب:',
      failed: 'تعذر تعيين كلمة المرور للحساب المطلوب.',
    },
    roles: {
      Administrator: 'مدير النظام',
      'Litigation Assistant': 'مساعد إدارة الدعاوى',
      Lawyer: 'محامٍ',
      Paralegal: 'مساعد قانوني',
    },
  },

  users: {
    title: 'إدارة المستخدمين',
    subtitle: 'إنشاء الحسابات وإدارة الصلاحيات وحالة الدخول دون حذف السجلات',
    back: 'العودة إلى الرئيسية',
    createTitle: 'إنشاء حساب لموظف حالي',
    createDescription: 'تظهر هنا فقط أسماء الموظفين الحاليين النشطين الذين لا يملكون حساباً.',
    accountsTitle: 'الحسابات الحالية',
    accountsDescription: 'تشمل القائمة الحسابات المفعّلة والمعطّلة.',
    noEligibleStaff: 'لا يوجد موظف نشط مؤهل لإنشاء حساب حالياً.',
    person: 'الموظف',
    choosePerson: 'اختر موظفاً',
    chooseRole: 'اختر الدور',
    usernameHint:
      'يجب أن يبدأ اسم المستخدم بحرف لاتيني، وأن يكون طوله الإجمالي من 3 إلى 64 حرفاً. ويجوز أن تتضمن الأحرف اللاحقة حروفاً لاتينية وأرقاماً ونقطة وشرطة وشرطة سفلية.',
    temporaryPassword: 'كلمة المرور المؤقتة',
    confirmTemporaryPassword: 'تأكيد كلمة المرور المؤقتة',
    newUsername: 'اسم المستخدم الجديد',
    newRole: 'الدور الجديد',
    passwordState: 'حالة كلمة المرور',
    lockState: 'حالة القفل',
    lastLogin: 'آخر دخول ناجح',
    submitting: 'جارٍ الحفظ…',
    selfNotice: 'هذا حسابك الحالي؛ غيّر كلمة مرورك من شاشة تغيير كلمة المرور المعتادة.',
    states: {
      enabled: 'مفعّل',
      disabled: 'معطّل',
      passwordMissing: 'غير مهيأة',
      passwordTemporary: 'مؤقتة — يجب تغييرها',
      passwordReady: 'مهيأة',
      notLocked: 'غير مقفل',
      lockedUntil: (time: string) => `مقفل حتى ${time}`,
    },
    actions: {
      create: 'إنشاء الحساب',
      username: 'تصحيح اسم المستخدم',
      role: 'تغيير الدور',
      disable: 'تعطيل الحساب',
      reactivate: 'إعادة تفعيل الحساب',
      password: 'تعيين كلمة مرور مؤقتة',
      confirmUsername: (name: string) => `تأكيد تصحيح اسم مستخدم ${name}`,
      confirmRole: (name: string) => `تأكيد تغيير دور ${name}`,
      confirmDisable: (name: string) => `تأكيد تعطيل حساب ${name}`,
      confirmReactivate: (name: string) => `تأكيد إعادة تفعيل حساب ${name}`,
      confirmPassword: (name: string) => `تأكيد تعيين كلمة مرور مؤقتة لـ ${name}`,
    },
    confirmations: {
      username: (name: string) => `سيُصحَّح اسم مستخدم ${name} وتُبطل جميع جلساته الحالية فوراً.`,
      role: (name: string) => `سيتغير دور ${name} وتُبطل جميع جلساته الحالية فوراً.`,
      disable: (name: string) =>
        `سيُعطَّل حساب ${name}، وتُبطل جلساته، ويُمسح قفل الدخول دون حذف الشخص أو الحساب أو السجل التاريخي.`,
      disableCheckbox: (name: string) => `أؤكد أنني أريد تعطيل حساب ${name}.`,
      reactivate: (name: string) =>
        `سيُعاد تفعيل حساب ${name} بكلمة مرور مؤقتة جديدة يجب تغييرها عند أول دخول.`,
      password: (name: string) =>
        `ستُعيَّن كلمة مرور مؤقتة جديدة لـ ${name}، وتُبطل جميع جلساته الحالية، ويجب عليه تغييرها عند الدخول.`,
    },
    success: {
      created: 'تم إنشاء الحساب وتسجيل تهيئة كلمة المرور.',
      username: 'تم تصحيح اسم المستخدم وإبطال الجلسات السابقة.',
      role: 'تم تغيير الدور وإبطال الجلسات السابقة.',
      disabled: 'تم تعطيل الحساب وإبطال جلساته دون حذف أي سجل.',
      reactivated: 'تمت إعادة تفعيل الحساب بكلمة مرور مؤقتة جديدة.',
      password: 'تم تعيين كلمة المرور المؤقتة وإبطال الجلسات السابقة.',
    },
    errors: {
      generic: 'تعذر إتمام العملية. لم يُحفظ أي تغيير.',
      passwordMismatch: 'كلمتا المرور المؤقتتان غير متطابقتين.',
      confirmationRequired: 'يجب تأكيد تعطيل الحساب قبل المتابعة.',
      'administrator-required': 'يجب أن يكون المنفذ مدير نظام نشطاً ومؤهلاً للدخول.',
      'invalid-input': 'تحقق من البيانات المدخلة ثم حاول مرة أخرى.',
      'invalid-transition': 'حالة الحساب الحالية لا تسمح بهذه العملية.',
      'no-op': 'لم يتغير شيء؛ اختر قيمة مختلفة.',
      'not-found': 'لم يعد الحساب المطلوب موجوداً.',
      'password-policy': 'يجب ألا تقل كلمة المرور المؤقتة عن 12 حرفاً.',
      'self-protected':
        'لا يمكن لمدير النظام تعطيل حسابه أو خفض دوره أو إعادة تعيين كلمة مروره إدارياً.',
      stale: 'تغير الحساب منذ فتح الصفحة. حدّث الصفحة وراجع حالته قبل المحاولة مرة أخرى.',
    },
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
