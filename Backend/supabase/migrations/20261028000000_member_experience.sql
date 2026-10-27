-- ═══════════════════════════════════════════════════════════════════════════
-- Member experience update (2026-10-28)
--
-- Upgrades a database created before this change (it runs after
-- 20261027000000_admin_dashboard.sql). The init file was rebuilt with the same
-- schema, so on a fresh database every statement below is a no-op.
--
-- Adds: Researcher / Innovator / Professional / Learner roles with role
-- verification, member blocks, "Not interested", post views, comment
-- attachments, collaboration requests, "Delete chat", forum mute, featured
-- topics and gallery, topic descriptions, and the intellectual-property report
-- reason.
-- ═══════════════════════════════════════════════════════════════════════════

-- Enums -----------------------------------------------------------------------
ALTER TYPE "public"."member_role" ADD VALUE IF NOT EXISTS 'professional';
--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE IF NOT EXISTS 'learner';
--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE IF NOT EXISTS 'intellectual_property';
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'pending', 'verified', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- Columns ---------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verification_status" "verification_status" DEFAULT 'unverified' NOT NULL;
--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "view_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "forum_members" ADD COLUMN IF NOT EXISTS "muted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;
--> statement-breakpoint

-- Tables ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "member_verifications" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"member_role" "member_role" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"media_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" uuid,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "user_blocks_not_self" CHECK ("user_blocks"."blocker_id" <> "user_blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comment_media" (
	"comment_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "comment_media_comment_id_media_id_pk" PRIMARY KEY("comment_id","media_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hidden_posts" (
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hidden_posts_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "post_views" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_views_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "featured_media" (
	"featured_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "featured_media_featured_id_media_id_pk" PRIMARY KEY("featured_id","media_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "featured_topics" (
	"featured_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "featured_topics_featured_id_topic_id_pk" PRIMARY KEY("featured_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collaboration_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"project_id" uuid,
	"message" text,
	"status" "join_request_status" DEFAULT 'pending' NOT NULL,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "collaboration_requests_not_self" CHECK ("collaboration_requests"."sender_id" <> "collaboration_requests"."recipient_id")
);
--> statement-breakpoint

-- Foreign keys ----------------------------------------------------------------
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('member_verifications', 'member_verifications_user_id_users_id_fk', 'FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade'),
    ('member_verifications', 'member_verifications_reviewed_by_id_users_id_fk', 'FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null'),
    ('user_blocks', 'user_blocks_blocker_id_users_id_fk', 'FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade'),
    ('user_blocks', 'user_blocks_blocked_id_users_id_fk', 'FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade'),
    ('comment_media', 'comment_media_comment_id_comments_id_fk', 'FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade'),
    ('comment_media', 'comment_media_media_id_media_id_fk', 'FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade'),
    ('hidden_posts', 'hidden_posts_user_id_users_id_fk', 'FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade'),
    ('hidden_posts', 'hidden_posts_post_id_posts_id_fk', 'FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade'),
    ('post_views', 'post_views_post_id_posts_id_fk', 'FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade'),
    ('post_views', 'post_views_user_id_users_id_fk', 'FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade'),
    ('featured_media', 'featured_media_featured_id_featured_items_id_fk', 'FOREIGN KEY ("featured_id") REFERENCES "public"."featured_items"("id") ON DELETE cascade'),
    ('featured_media', 'featured_media_media_id_media_id_fk', 'FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade'),
    ('featured_topics', 'featured_topics_featured_id_featured_items_id_fk', 'FOREIGN KEY ("featured_id") REFERENCES "public"."featured_items"("id") ON DELETE cascade'),
    ('featured_topics', 'featured_topics_topic_id_topics_id_fk', 'FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade'),
    ('collaboration_requests', 'collaboration_requests_sender_id_users_id_fk', 'FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade'),
    ('collaboration_requests', 'collaboration_requests_recipient_id_users_id_fk', 'FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade'),
    ('collaboration_requests', 'collaboration_requests_project_id_projects_id_fk', 'FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade'),
    ('collaboration_requests', 'collaboration_requests_conversation_id_conversations_id_fk', 'FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null')
  ) AS v(tbl, name, def) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.name) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', fk.tbl, fk.name, fk.def);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- Indexes ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "member_verifications_status_idx" ON "member_verifications" USING btree ("status","submitted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "featured_topics_topic_idx" ON "featured_topics" USING btree ("topic_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collaboration_requests_recipient_idx" ON "collaboration_requests" USING btree ("recipient_id","status","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collaboration_requests_sender_idx" ON "collaboration_requests" USING btree ("sender_id","status","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "collaboration_requests_one_pending" ON "collaboration_requests" USING btree ("sender_id","recipient_id") WHERE "collaboration_requests"."status" = 'pending';
--> statement-breakpoint

-- updated_at trigger and Row Level Security for the new tables -----------------
DROP TRIGGER IF EXISTS trg_member_verifications_updated_at ON public.member_verifications;
--> statement-breakpoint
CREATE TRIGGER trg_member_verifications_updated_at BEFORE UPDATE ON public.member_verifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['member_verifications', 'user_blocks', 'comment_media', 'hidden_posts', 'post_views', 'featured_media', 'featured_topics', 'collaboration_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Topic descriptions (shown under each topic in the pickers) --------------------
UPDATE public.topics t SET description = v.d
FROM (VALUES
  ('ai-ml', 'AI, machine learning, data science and automation'),
  ('entrepreneurship', 'Founding, funding and growing ventures'),
  ('social-impact', 'Inclusion, livelihoods and community projects'),
  ('manufacturing', 'Production, hardware and smart factories'),
  ('cybersecurity', 'Security, privacy and safe digital services'),
  ('robotics', 'Robots, drones and automated systems'),
  ('smart-cities', 'Mobility, housing, utilities and urban tech'),
  ('fintech', 'Payments, lending, savings and financial inclusion'),
  ('iot', 'Sensors, connected devices and embedded systems'),
  ('agriculture', 'Farming, agritech, food security and more'),
  ('sustainability', 'Clean energy, climate action, circular economy'),
  ('healthtech', 'Digital health, diagnostics and care delivery'),
  ('edtech', 'Learning, skills, research and development'),
  ('energy', 'Solar, wind, storage and off-grid power')
) AS v(slug, d)
WHERE t.slug = v.slug AND t.description = '';
