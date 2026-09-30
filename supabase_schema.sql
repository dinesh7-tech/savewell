-- ============================================================
-- SAVEWELL REAL-TIME PERSONAL SAVINGS TRACKER - COMPATIBLE SUPABASE SCHEMA
-- Self-healing migration that adapts to existing column types (UUID / INTEGER)
-- Execute this entire script in your Supabase SQL Editor (https://supabase.com/dashboard)
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
-- 2. CATEGORIES TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Other',
    icon TEXT NOT NULL DEFAULT '💰',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Savings Goal';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🎯';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS target_amount NUMERIC(14,2) DEFAULT 1000;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS target_paise INTEGER DEFAULT 100000;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS starting_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS starting_paise INTEGER DEFAULT 0;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS target_date DATE;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT FALSE;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure target_paise and starting_paise have safe default / nullable if both schemas exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'target_paise') THEN
    ALTER TABLE public.goals ALTER COLUMN target_paise SET DEFAULT 0;
    ALTER TABLE public.goals ALTER COLUMN target_paise DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'starting_paise') THEN
    ALTER TABLE public.goals ALTER COLUMN starting_paise SET DEFAULT 0;
    ALTER TABLE public.goals ALTER COLUMN starting_paise DROP NOT NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. SAVINGS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.savings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    saving_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    is_goal_linked BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS saving_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS is_goal_linked BOOLEAN DEFAULT TRUE;
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.savings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------
-- 5. BUDGETS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
    target_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    budget_type TEXT NOT NULL DEFAULT 'overall', -- 'overall', 'category', 'goal'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE);
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE);
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS target_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS budget_type TEXT DEFAULT 'overall';
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Dynamic type alignment for category_id & goal_id across savings and budgets
DO $$
DECLARE
  cat_type text;
  goal_type text;
BEGIN
  -- Get categories.id type
  SELECT data_type INTO cat_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'id';

  -- Get goals.id type
  SELECT data_type INTO goal_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'id';

  -- 1. Align savings.category_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'savings' AND column_name = 'category_id') THEN
    IF cat_type = 'integer' OR cat_type = 'bigint' OR cat_type = 'smallint' THEN
      ALTER TABLE public.savings ADD COLUMN category_id BIGINT REFERENCES public.categories(id) ON DELETE RESTRICT;
    ELSE
      ALTER TABLE public.savings ADD COLUMN category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT;
    END IF;
  END IF;

  -- 2. Align savings.goal_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'savings' AND column_name = 'goal_id') THEN
    IF goal_type = 'integer' OR goal_type = 'bigint' OR goal_type = 'smallint' THEN
      ALTER TABLE public.savings ADD COLUMN goal_id BIGINT REFERENCES public.goals(id) ON DELETE SET NULL;
    ELSE
      ALTER TABLE public.savings ADD COLUMN goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;
    END IF;
  END IF;

  -- 3. Align budgets.category_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'budgets' AND column_name = 'category_id') THEN
    IF cat_type = 'integer' OR cat_type = 'bigint' OR cat_type = 'smallint' THEN
      ALTER TABLE public.budgets ADD COLUMN category_id BIGINT REFERENCES public.categories(id) ON DELETE CASCADE;
    ELSE
      ALTER TABLE public.budgets ADD COLUMN category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE;
    END IF;
  ELSE
    -- Check if constraint or type mismatch exists, safely add constraint if missing
    BEGIN
      ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_category_id_fkey;
      ALTER TABLE public.budgets ADD CONSTRAINT budgets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- 4. Align budgets.goal_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'budgets' AND column_name = 'goal_id') THEN
    IF goal_type = 'integer' OR goal_type = 'bigint' OR goal_type = 'smallint' THEN
      ALTER TABLE public.budgets ADD COLUMN goal_id BIGINT REFERENCES public.goals(id) ON DELETE CASCADE;
    ELSE
      ALTER TABLE public.budgets ADD COLUMN goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE;
    END IF;
  ELSE
    BEGIN
      ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_goal_id_fkey;
      ALTER TABLE public.budgets ADD CONSTRAINT budgets_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 6. MONEY LENT TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.money_lent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    person_name TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    due_date DATE,
    lent_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'Partially Returned', 'Returned', 'Overdue'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.money_lent ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.money_lent ADD COLUMN IF NOT EXISTS person_name TEXT DEFAULT 'Friend';
ALTER TABLE public.money_lent ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.money_lent ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.money_lent ADD COLUMN IF NOT EXISTS lent_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.money_lent ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.money_lent ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';
ALTER TABLE public.money_lent ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.money_lent ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------
-- 7. MONEY LENT REPAYMENTS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.money_lent_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    money_lent_id UUID NOT NULL REFERENCES public.money_lent(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    repayment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.money_lent_repayments ADD COLUMN IF NOT EXISTS money_lent_id UUID REFERENCES public.money_lent(id) ON DELETE CASCADE;
ALTER TABLE public.money_lent_repayments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.money_lent_repayments ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.money_lent_repayments ADD COLUMN IF NOT EXISTS repayment_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.money_lent_repayments ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.money_lent_repayments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------
-- 8. BORROWED MONEY (MONEY I OWE) TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.borrowed_money (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    person_name TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    borrowed_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    reminder_option TEXT DEFAULT 'none', -- 'none', '1_day', '3_days', '7_days', 'custom'
    reminder_date DATE,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'Partially Paid', 'Paid'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.borrowed_money ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.borrowed_money ADD COLUMN IF NOT EXISTS person_name TEXT DEFAULT 'Lender';
ALTER TABLE public.borrowed_money ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.borrowed_money ADD COLUMN IF NOT EXISTS borrowed_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.borrowed_money ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.borrowed_money ADD COLUMN IF NOT EXISTS reminder_option TEXT DEFAULT 'none';
ALTER TABLE public.borrowed_money ADD COLUMN IF NOT EXISTS reminder_date DATE;
ALTER TABLE public.borrowed_money ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.borrowed_money ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';
ALTER TABLE public.borrowed_money ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.borrowed_money ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------
-- 9. BORROWED MONEY REPAYMENTS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.borrowed_money_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrowed_money_id UUID NOT NULL REFERENCES public.borrowed_money(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    repayment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.borrowed_money_repayments ADD COLUMN IF NOT EXISTS borrowed_money_id UUID REFERENCES public.borrowed_money(id) ON DELETE CASCADE;
ALTER TABLE public.borrowed_money_repayments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.borrowed_money_repayments ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.borrowed_money_repayments ADD COLUMN IF NOT EXISTS repayment_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.borrowed_money_repayments ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.borrowed_money_repayments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------
-- 10. PERFORMANCE INDEXES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_savings_user_id ON public.savings(user_id);
CREATE INDEX IF NOT EXISTS idx_savings_user_date ON public.savings(user_id, saving_date);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_ym ON public.budgets(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_money_lent_user ON public.money_lent(user_id);
CREATE INDEX IF NOT EXISTS idx_money_lent_status ON public.money_lent(user_id, status);
CREATE INDEX IF NOT EXISTS idx_money_repayments_lent ON public.money_lent_repayments(money_lent_id);
CREATE INDEX IF NOT EXISTS idx_money_repayments_user ON public.money_lent_repayments(user_id);
CREATE INDEX IF NOT EXISTS idx_borrowed_money_user ON public.borrowed_money(user_id);
CREATE INDEX IF NOT EXISTS idx_borrowed_money_status ON public.borrowed_money(user_id, status);
CREATE INDEX IF NOT EXISTS idx_borrowed_money_due ON public.borrowed_money(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_borrowed_rep_borrowed ON public.borrowed_money_repayments(borrowed_money_id);
CREATE INDEX IF NOT EXISTS idx_borrowed_rep_user ON public.borrowed_money_repayments(user_id);

-- ------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_lent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_lent_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrowed_money ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrowed_money_repayments ENABLE ROW LEVEL SECURITY;

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

-- Budgets Policies
DROP POLICY IF EXISTS "Users can select own budgets" ON public.budgets;
CREATE POLICY "Users can select own budgets" ON public.budgets FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own budgets" ON public.budgets;
CREATE POLICY "Users can insert own budgets" ON public.budgets FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own budgets" ON public.budgets;
CREATE POLICY "Users can update own budgets" ON public.budgets FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own budgets" ON public.budgets;
CREATE POLICY "Users can delete own budgets" ON public.budgets FOR DELETE USING (auth.uid() = user_id);

-- Money Lent Policies
DROP POLICY IF EXISTS "Users can select own money lent" ON public.money_lent;
CREATE POLICY "Users can select own money lent" ON public.money_lent FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own money lent" ON public.money_lent;
CREATE POLICY "Users can insert own money lent" ON public.money_lent FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own money lent" ON public.money_lent;
CREATE POLICY "Users can update own money lent" ON public.money_lent FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own money lent" ON public.money_lent;
CREATE POLICY "Users can delete own money lent" ON public.money_lent FOR DELETE USING (auth.uid() = user_id);

-- Money Lent Repayments Policies
DROP POLICY IF EXISTS "Users can select own repayments" ON public.money_lent_repayments;
CREATE POLICY "Users can select own repayments" ON public.money_lent_repayments FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own repayments" ON public.money_lent_repayments;
CREATE POLICY "Users can insert own repayments" ON public.money_lent_repayments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own repayments" ON public.money_lent_repayments;
CREATE POLICY "Users can update own repayments" ON public.money_lent_repayments FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own repayments" ON public.money_lent_repayments;
CREATE POLICY "Users can delete own repayments" ON public.money_lent_repayments FOR DELETE USING (auth.uid() = user_id);

-- Borrowed Money (Money I Owe) Policies
DROP POLICY IF EXISTS "Users can select own borrowed money" ON public.borrowed_money;
CREATE POLICY "Users can select own borrowed money" ON public.borrowed_money FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own borrowed money" ON public.borrowed_money;
CREATE POLICY "Users can insert own borrowed money" ON public.borrowed_money FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own borrowed money" ON public.borrowed_money;
CREATE POLICY "Users can update own borrowed money" ON public.borrowed_money FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own borrowed money" ON public.borrowed_money;
CREATE POLICY "Users can delete own borrowed money" ON public.borrowed_money FOR DELETE USING (auth.uid() = user_id);

-- Borrowed Money Repayments Policies
DROP POLICY IF EXISTS "Users can select own borrowed repayments" ON public.borrowed_money_repayments;
CREATE POLICY "Users can select own borrowed repayments" ON public.borrowed_money_repayments FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own borrowed repayments" ON public.borrowed_money_repayments;
CREATE POLICY "Users can insert own borrowed repayments" ON public.borrowed_money_repayments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own borrowed repayments" ON public.borrowed_money_repayments;
CREATE POLICY "Users can update own borrowed repayments" ON public.borrowed_money_repayments FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own borrowed repayments" ON public.borrowed_money_repayments;
CREATE POLICY "Users can delete own borrowed repayments" ON public.borrowed_money_repayments FOR DELETE USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 12. SUPABASE REALTIME REPLICATION
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE public.categories, public.goals, public.savings, public.budgets, public.money_lent, public.money_lent_repayments, public.borrowed_money, public.borrowed_money_repayments;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.categories, public.goals, public.savings, public.budgets, public.money_lent, public.money_lent_repayments, public.borrowed_money, public.borrowed_money_repayments;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
