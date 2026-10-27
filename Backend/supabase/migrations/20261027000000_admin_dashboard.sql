-- ═══════════════════════════════════════════════════════════════════════════
-- Admin dashboard update (2026-10-27)
--
-- Upgrades a database created from 20260924000000_init.sql BEFORE this change.
-- The init file was rebuilt with the same schema, so on a fresh database every
-- statement below is a no-op (everything is IF NOT EXISTS / guarded).
--
-- Adds: forum/project moderation status, report numbers, audit-log location,
-- profile fields (location, phone, expert verification), event organizer and
-- new categories, highlight → event link, email broadcasts with per-recipient
-- delivery, platform settings and maintenance windows.
-- ═══════════════════════════════════════════════════════════════════════════

-- Enums -----------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE "public"."community_status" AS ENUM('active', 'flagged', 'restricted', 'suspended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."broadcast_status" AS ENUM('sending', 'sent', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TYPE "public"."event_category" ADD VALUE IF NOT EXISTS 'bootcamp';
--> statement-breakpoint
ALTER TYPE "public"."event_category" ADD VALUE IF NOT EXISTS 'networking_fair';
--> statement-breakpoint
ALTER TYPE "public"."otp_purpose" ADD VALUE IF NOT EXISTS 'email_change';
--> statement-breakpoint

-- Columns ---------------------------------------------------------------------
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "location" text,
  ADD COLUMN IF NOT EXISTS "phone" text,
  ADD COLUMN IF NOT EXISTS "institutional_email" text,
  ADD COLUMN IF NOT EXISTS "research_link" text,
  ADD COLUMN IF NOT EXISTS "research_evidence" text;
--> statement-breakpoint
ALTER TABLE "forums"
  ADD COLUMN IF NOT EXISTS "moderation_status" "community_status" DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "moderation_reason" text,
  ADD COLUMN IF NOT EXISTS "moderation_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "moderation_status" "community_status" DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "moderation_reason" text,
  ADD COLUMN IF NOT EXISTS "moderation_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "organizer_name" text,
  ADD COLUMN IF NOT EXISTS "organizer_logo_url" text,
  ADD COLUMN IF NOT EXISTS "organizer_tagline" text;
--> statement-breakpoint
ALTER TABLE "highlights" ADD COLUMN IF NOT EXISTS "event_id" uuid;
--> statement-breakpoint
-- Existing reports are numbered in insertion order.
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "number" integer GENERATED ALWAYS AS IDENTITY (sequence name "reports_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "location" text;
--> statement-breakpoint
-- Broadcasts sent before this change were in-app only.
ALTER TABLE "broadcasts"
  ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'announcement' NOT NULL,
  ADD COLUMN IF NOT EXISTS "channels" jsonb DEFAULT '{"email":false,"inApp":true}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "status" "broadcast_status" DEFAULT 'sent' NOT NULL,
  ADD COLUMN IF NOT EXISTS "delivered_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "failed_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "broadcasts" SET "delivered_count" = "recipient_count" WHERE "delivered_count" = 0 AND "sent_at" IS NOT NULL AND NOT ("channels" ->> 'email')::boolean;
--> statement-breakpoint

-- Tables ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "broadcast_deliveries" (
	"broadcast_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"error" text,
	"sent_at" timestamp with time zone,
	CONSTRAINT "broadcast_deliveries_broadcast_id_user_id_pk" PRIMARY KEY("broadcast_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"image_optimization" boolean DEFAULT true NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_singleton" CHECK ("platform_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenance_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"disable_access" boolean DEFAULT false NOT NULL,
	"broadcast_id" uuid,
	"created_by_id" uuid NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_windows_order" CHECK ("maintenance_windows"."ends_at" > "maintenance_windows"."starts_at")
);
--> statement-breakpoint

-- Foreign keys ----------------------------------------------------------------
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('highlights', 'highlights_event_id_events_id_fk', 'FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null'),
    ('broadcast_deliveries', 'broadcast_deliveries_broadcast_id_broadcasts_id_fk', 'FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade'),
    ('broadcast_deliveries', 'broadcast_deliveries_user_id_users_id_fk', 'FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade'),
    ('maintenance_windows', 'maintenance_windows_broadcast_id_broadcasts_id_fk', 'FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE set null'),
    ('maintenance_windows', 'maintenance_windows_created_by_id_users_id_fk', 'FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict'),
    ('platform_settings', 'platform_settings_updated_by_id_users_id_fk', 'FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null')
  ) AS v(tbl, name, def) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.name) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', fk.tbl, fk.name, fk.def);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- Indexes ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "broadcast_deliveries_pending_idx" ON "broadcast_deliveries" USING btree ("status","broadcast_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_windows_time_idx" ON "maintenance_windows" USING btree ("starts_at","ends_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_id");
--> statement-breakpoint

-- updated_at triggers and Row Level Security for the new tables -----------------
DROP TRIGGER IF EXISTS trg_platform_settings_updated_at ON public.platform_settings;
--> statement-breakpoint
CREATE TRIGGER trg_platform_settings_updated_at BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_maintenance_windows_updated_at ON public.maintenance_windows;
--> statement-breakpoint
CREATE TRIGGER trg_maintenance_windows_updated_at BEFORE UPDATE ON public.maintenance_windows FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
ALTER TABLE public.broadcast_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.maintenance_windows ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
INSERT INTO public.platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
