-- ═══════════════════════════════════════════════════════════════════════════
-- Onboarding auto-verification (2026-10-30)
--
-- Upgrades a database created before this change (it runs after
-- 20261028000000_member_experience.sql). The init file was rebuilt with the
-- same schema, so on a fresh database every statement below is a no-op.
--
-- Role forms are now verified automatically on submit instead of waiting in the
-- admin review queue. This adds where the automatic decision is recorded and the
-- indexes used to stop one ORCID iD or role email backing two accounts.
--
-- Forms still `pending` from the old manual flow are re-checked automatically by
-- the daily cron (GET /api/v1/internal/cron/cleanup), or one by one from the
-- admin dashboard (POST /api/v1/admin/verifications/{userId}/recheck).
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- Columns ---------------------------------------------------------------------
ALTER TABLE "member_verifications" ADD COLUMN IF NOT EXISTS "decided_by" text;
--> statement-breakpoint
ALTER TABLE "member_verifications" ADD COLUMN IF NOT EXISTS "trust_score" smallint;
--> statement-breakpoint
ALTER TABLE "member_verifications" ADD COLUMN IF NOT EXISTS "auto_checks" jsonb;
--> statement-breakpoint

-- Decisions made before this change were made by admins -----------------------
UPDATE "member_verifications"
SET "decided_by" = 'admin'
WHERE "decided_by" IS NULL AND "status" IN ('verified', 'rejected');
--> statement-breakpoint

-- Duplicate-identity lookups --------------------------------------------------
CREATE INDEX IF NOT EXISTS "member_verifications_orcid_idx" ON "member_verifications" USING btree (("details" ->> 'orcidId'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_verifications_inst_email_idx" ON "member_verifications" USING btree (lower("details" ->> 'institutionalEmail'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_verifications_work_email_idx" ON "member_verifications" USING btree (lower("details" ->> 'workEmail'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_verifications_student_email_idx" ON "member_verifications" USING btree (lower("details" ->> 'studentEmail'));
