-- ═══════════════════════════════════════════════════════════════════════════
-- Part 2 — hand-written: extensions, triggers, search, security, seed.
-- Everything is idempotent and guarded so it also runs on plain Postgres
-- (local dev / CI) where the Supabase `auth`, `realtime` and `storage`
-- schemas do not exist.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- updated_at maintenance ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$I', t.table_name);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t.table_name);
  END LOOP;
END $$;
--> statement-breakpoint

-- Search (trigram, supports ILIKE '%term%') ----------------------------------
CREATE INDEX IF NOT EXISTS users_search_trgm ON public.users USING gin ((coalesce(full_name,'') || ' ' || coalesce(username,'') || ' ' || coalesce(headline,'')) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS posts_body_trgm ON public.posts USING gin (body gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_search_trgm ON public.projects USING gin ((title || ' ' || pitch) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS forums_search_trgm ON public.forums USING gin ((name || ' ' || about) gin_trgm_ops);
--> statement-breakpoint

-- Row Level Security ----------------------------------------------------------
-- The API connects as the database owner and bypasses RLS. Enabling RLS with no
-- policies means Supabase's public REST/GraphQL endpoints (anon / authenticated
-- keys) can read or write nothing. All access goes through this API.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint

-- Supabase Realtime authorisation --------------------------------------------
-- Clients subscribe to private broadcast channels:
--   user:<userId>                  notifications, account status
--   conversation:<conversationId>  new messages, typing, read receipts
--   project:<projectId>            workspace ledger updates
-- Access is checked against membership using the `sub` of the API access token
-- (the API signs tokens with the project's JWT secret; see README).
CREATE OR REPLACE FUNCTION public.realtime_can_access(p_topic text, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE split_part(p_topic, ':', 1)
    WHEN 'user' THEN split_part(p_topic, ':', 2) = p_user::text
    WHEN 'conversation' THEN EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id::text = split_part(p_topic, ':', 2) AND cm.user_id = p_user)
    WHEN 'project' THEN EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id::text = split_part(p_topic, ':', 2) AND pm.user_id = p_user)
    ELSE false
  END
$$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.realtime_can_access(text, uuid) FROM PUBLIC, anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.realtime_can_access(text, uuid) TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'realtime' AND table_name = 'messages')
     AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    EXECUTE 'DROP POLICY IF EXISTS communiti_realtime_read ON realtime.messages';
    EXECUTE 'CREATE POLICY communiti_realtime_read ON realtime.messages FOR SELECT TO authenticated
             USING (public.realtime_can_access(realtime.topic(), auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS communiti_realtime_write ON realtime.messages';
    EXECUTE 'CREATE POLICY communiti_realtime_write ON realtime.messages FOR INSERT TO authenticated
             WITH CHECK (public.realtime_can_access(realtime.topic(), auth.uid()) AND split_part(realtime.topic(), '':'', 1) = ''conversation'')';
  END IF;
END $$;
--> statement-breakpoint

-- Supabase Storage buckets ----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('public-media', 'public-media', true, 209715200),
           ('private-files', 'private-files', false, 52428800)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint

-- Seed: interest topics (Figma "Feed customization" + project tags) -----------
INSERT INTO public.topics (slug, name, sort_order) VALUES
  ('ai-ml', 'Artificial Intelligence & Machine Learning', 1),
  ('entrepreneurship', 'Entrepreneurship & Startups', 2),
  ('social-impact', 'Social Impact & Community Development', 3),
  ('manufacturing', 'Manufacturing & Industry 4.0', 4),
  ('cybersecurity', 'Cybersecurity & Digital Trust', 5),
  ('robotics', 'Robotics & Automation', 6),
  ('smart-cities', 'Smart Cities & Infrastructure', 7),
  ('fintech', 'FinTech & Digital Finance', 8),
  ('iot', 'Internet of Things (IoT)', 9),
  ('agriculture', 'Agriculture & AgriTech', 10),
  ('sustainability', 'Sustainability & Climate', 11),
  ('healthtech', 'HealthTech', 12),
  ('edtech', 'Education & EdTech', 13),
  ('energy', 'Renewable Energy', 14)
ON CONFLICT (slug) DO NOTHING;
