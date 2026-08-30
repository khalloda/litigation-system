BEGIN;

-- Access `admin work table`.`تاريخ الإنشاء` is the administrative task's
-- business creation date. It is not PostgreSQL's row insertion timestamp.
-- The separate, serializable backfill matches existing rows by durable source
-- identity after this additive schema migration is applied. Fresh databases
-- receive the value directly from the Task 2.9A transform.
ALTER TABLE public.admin_tasks
    ADD COLUMN task_created_date date;

COMMIT;
