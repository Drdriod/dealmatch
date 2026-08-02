-- ============================================================================
-- DealMatch Community Forum
-- Additive only — does not touch any existing table. Built for SEO/AEO:
-- category-scoped long-tail Q&A/discussion content, permanent URLs (soft-hide
-- instead of hard-delete, since deleting indexed URLs is bad for SEO),
-- full-text search, and denormalized counters for fast listing pages.
-- ============================================================================

-- Shared updated_at trigger fn (generic name — the multicategory migration's
-- set_category_listings_updated_at() is table-specific and untouched here)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 1. Forum categories ─────────────────────────────────────────────────────
-- Deliberately separate from `public.categories` (the dynamic-listing catalog
-- from the multicategory migration) — forum categories mirror ALL site
-- verticals, including the pre-existing ones (real-estate, rentals, hotels,
-- student-hostels, professionals) that don't live in `categories` at all.
CREATE TABLE public.forum_categories (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(60) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,                    -- shown on category page, used as meta description
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Threads ───────────────────────────────────────────────────────────────
CREATE TABLE public.forum_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id INT NOT NULL REFERENCES public.forum_categories(id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL,           -- URL-safe, unique per category
  body TEXT NOT NULL,
  thread_type VARCHAR(20) NOT NULL DEFAULT 'DISCUSSION'
    CHECK (thread_type IN ('DISCUSSION', 'QUESTION')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED', 'HIDDEN')), -- HIDDEN = moderated; URL stays live, returns 404 to crawlers
  accepted_post_id UUID,                -- set after forum_posts exists below
  is_pinned BOOLEAN DEFAULT FALSE,
  view_count INT NOT NULL DEFAULT 0,
  reply_count INT NOT NULL DEFAULT 0,
  search_vector TSVECTOR,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (category_id, slug)
);

CREATE INDEX idx_forum_threads_category   ON public.forum_threads(category_id, status, is_pinned DESC, last_activity_at DESC);
CREATE INDEX idx_forum_threads_user       ON public.forum_threads(user_id);
CREATE INDEX idx_forum_threads_search     ON public.forum_threads USING GIN(search_vector);

CREATE TRIGGER trg_forum_threads_updated_at
  BEFORE UPDATE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.forum_threads_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A')
                     || setweight(to_tsvector('english', coalesce(NEW.body, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_forum_threads_search_vector
  BEFORE INSERT OR UPDATE OF title, body ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.forum_threads_search_vector_update();

-- ── 3. Posts (replies) ──────────────────────────────────────────────────────
CREATE TABLE public.forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,     -- soft delete: preserves reply numbering/permalinks
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_forum_posts_thread ON public.forum_posts(thread_id, created_at);
CREATE INDEX idx_forum_posts_user   ON public.forum_posts(user_id);

CREATE TRIGGER trg_forum_posts_updated_at
  BEFORE UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.forum_threads
  ADD CONSTRAINT fk_forum_threads_accepted_post
  FOREIGN KEY (accepted_post_id) REFERENCES public.forum_posts(id) ON DELETE SET NULL;

-- ── 4. Counters: keep reply_count / last_activity_at in sync without an
--      app-level round trip on every reply ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.forum_posts_after_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_threads
      SET reply_count = reply_count + 1, last_activity_at = NOW()
      WHERE id = NEW.thread_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
    UPDATE public.forum_threads
      SET reply_count = GREATEST(reply_count - 1, 0)
      WHERE id = NEW.thread_id;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_forum_posts_after_change
  AFTER INSERT OR UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.forum_posts_after_change();

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_categories_public_read" ON public.forum_categories
  FOR SELECT USING (is_active = true);

-- Public read covers OPEN and CLOSED; HIDDEN threads are excluded here so a
-- moderated thread's content isn't readable via direct API/RLS bypass —
-- api/platform.js (render=html path) separately returns a real 404 status for HIDDEN threads.
CREATE POLICY "forum_threads_public_read" ON public.forum_threads
  FOR SELECT USING (status IN ('OPEN', 'CLOSED') OR auth.uid() = user_id);

CREATE POLICY "forum_threads_owner_insert" ON public.forum_threads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "forum_threads_owner_update" ON public.forum_threads
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "forum_posts_public_read" ON public.forum_posts
  FOR SELECT USING (is_deleted = false OR auth.uid() = user_id);

CREATE POLICY "forum_posts_owner_insert" ON public.forum_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "forum_posts_owner_update" ON public.forum_posts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 6. View-count increment RPC (avoids a race-prone read-then-write from the API) ─
CREATE OR REPLACE FUNCTION public.increment_thread_view_count(p_thread_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.forum_threads SET view_count = view_count + 1 WHERE id = p_thread_id;
$$;

-- SECURITY DEFINER is required here: view counting must work for anonymous
-- visitors, but forum_threads_owner_update only lets the thread's author
-- UPDATE via RLS. This function is intentionally narrow (one column, one
-- row, no user-controlled SQL) so bypassing RLS is safe.
