-- Task 4.8 / D67: owner-approved display labels only. Candidate migration 72.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.lookup_invoice_status, public.lookup_invoice_type,
  public.lookup_lawyer_share_role IN ACCESS EXCLUSIVE MODE;
DO $precondition$
BEGIN
  IF current_user <> session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
    OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 71
    OR EXISTS (SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL
      AND migration_name <> '20260918100000_billing_arabic_labels') THEN
    RAISE EXCEPTION 'Complete migration-71 direct migration principal required';
  END IF;
  IF (SELECT array_agg(code ORDER BY code COLLATE "C") FROM public.lookup_invoice_status)
      IS DISTINCT FROM ARRAY['Canceled','Later','Paid','Partially Paid','Unpaid']
    OR (SELECT array_agg(code ORDER BY code COLLATE "C") FROM public.lookup_invoice_type)
      IS DISTINCT FROM ARRAY['Expenses','Service']
    OR (SELECT array_agg(code ORDER BY code COLLATE "C") FROM public.lookup_lawyer_share_role)
      IS DISTINCT FROM ARRAY['LawyerA','LawyerA+','LawyerB','Reviewer']
    OR EXISTS (SELECT 1 FROM public.lookup_invoice_status WHERE label_ar IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.lookup_invoice_type WHERE label_ar IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.lookup_lawyer_share_role WHERE label_ar IS NOT NULL) THEN
    RAISE EXCEPTION 'Exact eleven original billing codes and NULL labels required';
  END IF;
END
$precondition$;
SELECT public.audit_set_migration_context();
SELECT public.audit_set_event_context(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
  NULL,'controlled-maintenance:task-4-8-d67-labels','system');
UPDATE public.lookup_invoice_status l SET label_ar=v.label,updated_at=transaction_timestamp()
FROM (VALUES ('Paid','مسددة'),('Unpaid','غير مسددة'),('Partially Paid','مسددة جزئيًا'),
  ('Later','مؤجلة'),('Canceled','ملغاة')) v(code,label) WHERE l.code=v.code;
UPDATE public.lookup_invoice_type l SET label_ar=v.label,updated_at=transaction_timestamp()
FROM (VALUES ('Service','خدمات'),('Expenses','مصروفات')) v(code,label) WHERE l.code=v.code;
UPDATE public.lookup_lawyer_share_role l SET label_ar=v.label,updated_at=transaction_timestamp()
FROM (VALUES ('Reviewer','الشريك المراجع'),('LawyerA','المحامي الرئيسي'),
  ('LawyerB','محامٍ مساعد'),('LawyerA+','محامٍ رئيسي مشارك')) v(code,label) WHERE l.code=v.code;
COMMIT;
