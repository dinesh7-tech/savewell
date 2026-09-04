-- ============================================================
-- SAVEWELL REAL-TIME PERSONAL SAVINGS TRACKER - SUPABASE DATABASE SCHEMA
-- Execute this SQL in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- 1. PROFILES TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ------------------------------------------------------------
-- 2. CATEGORIES TABLE (MONEY SOURCES)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Other',
    icon TEXT NOT NULL DEFAULT '💰',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure user_id and all required columns exist even if table was created previously
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Other';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '💰';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------
-- 3. GOALS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Savings Goal',
    icon TEXT NOT NULL DEFAULT '🎯',
    target_amount NUMERIC(14,2) NOT NULL DEFAULT 1000,
    starting_amount NUMERIC(14,2) DEFAULT 0,
    target_date DATE,
    description TEXT,
    is_main BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure user_id and all required columns exist even if table was created previously
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Savings Goal';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🎯';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS target_amount NUMERIC(14,2) DEFAULT 1000;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS starting_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS target_date DATE;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT FALSE;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------
-- 4. SAVINGS TABLE (TRANSACTIONS)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.savings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
    goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    saving_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    is_goal_linked BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure user_id and all required columns exist even if table was created previously
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS saving_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS is_goal_linked BOOLEAN DEFAULT TRUE;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------
-- 5. PERFORMANCE INDEXES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_savings_user_id ON public.savings(user_id);
CREATE INDEX IF NOT EXISTS idx_savings_user_date ON public.savings(user_id, saving_date);
CREATE INDEX IF NOT EXISTS idx_savings_user_category ON public.savings(user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_savings_user_goal ON public.savings(user_id, goal_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);

-- ------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can select own profile" ON public.profiles;
CREATE POLICY "Users can select own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Categories Policies
DROP POLICY IF EXISTS "Users can select own categories" ON public.categories;
CREATE POLICY "Users can select own categories" ON public.categories FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own categories" ON public.categories;
CREATE POLICY "Users can insert own categories" ON public.categories FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own categories" ON public.categories;
CREATE POLICY "Users can update own categories" ON public.categories FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own categories" ON public.categories;
CREATE POLICY "Users can delete own categories" ON public.categories FOR DELETE USING (auth.uid() = user_id);

-- Goals Policies
DROP POLICY IF EXISTS "Users can select own goals" ON public.goals;
CREATE POLICY "Users can select own goals" ON public.goals FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own goals" ON public.goals;
CREATE POLICY "Users can insert own goals" ON public.goals FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own goals" ON public.goals;
CREATE POLICY "Users can update own goals" ON public.goals FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own goals" ON public.goals;
CREATE POLICY "Users can delete own goals" ON public.goals FOR DELETE USING (auth.uid() = user_id);

-- Savings Policies
DROP POLICY IF EXISTS "Users can select own savings" ON public.savings;
CREATE POLICY "Users can select own savings" ON public.savings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own savings" ON public.savings;
CREATE POLICY "Users can insert own savings" ON public.savings FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own savings" ON public.savings;
CREATE POLICY "Users can update own savings" ON public.savings FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own savings" ON public.savings;
CREATE POLICY "Users can delete own savings" ON public.savings FOR DELETE USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 7. SUPABASE REALTIME REPLICATION
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE public.categories, public.goals, public.savings;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.categories, public.goals, public.savings;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
