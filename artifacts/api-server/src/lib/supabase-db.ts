import { createClient } from "@supabase/supabase-js";
import { readDb, writeDb, type DBData, type Category, type Goal, type Saving } from "./json-db";

export const SUPABASE_URL = "https://syjnmyajujzbzyygqznb.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5am5teWFqdWp6Ynp5eWdxem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MzA1NjQsImV4cCI6MjEwNDEwNjU2NH0.ndtImWH9xcxHnf5h6Qi_z598NFW6dUmElHBGnu8EgIM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function fetchSupabaseData(): Promise<DBData | null> {
  try {
    const [catRes, goalRes, savRes] = await Promise.all([
      supabase.from("categories").select("*"),
      supabase.from("goals").select("*"),
      supabase.from("savings").select("*"),
    ]);

    if (catRes.error || goalRes.error || savRes.error) {
      console.warn("Supabase query warning:", catRes.error?.message || goalRes.error?.message || savRes.error?.message);
      return null;
    }

    const categories: Category[] = (catRes.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      createdAt: c.created_at || new Date().toISOString(),
    }));

    const goals: Goal[] = (goalRes.data || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      targetPaise: Number(g.target_amount != null ? Math.round(Number(g.target_amount) * 100) : (g.target_paise || 0)),
      startingPaise: Number(g.starting_amount != null ? Math.round(Number(g.starting_amount) * 100) : (g.starting_paise || 0)),
      targetDate: g.target_date || null,
      description: g.description || null,
      isMain: Boolean(g.is_main),
      createdAt: g.created_at || new Date().toISOString(),
    }));

    const savings: Saving[] = (savRes.data || []).map((s: any) => ({
      id: s.id,
      amountPaise: Number(s.amount != null ? Math.round(Number(s.amount) * 100) : (s.amount_paise || 0)),
      categoryId: Number(s.category_id),
      goalId: s.goal_id ? Number(s.goal_id) : null,
      date: (s.date || s.saving_date || "").slice(0, 10),
      note: s.note || null,
      isGoalLinked: Boolean(s.is_goal_linked),
      createdAt: s.created_at || new Date().toISOString(),
    }));

    return { categories, goals, savings };
  } catch (err) {
    console.error("Supabase fetch error:", err);
    return null;
  }
}

export async function insertSupabaseSaving(saving: Omit<Saving, "id">): Promise<Saving | null> {
  try {
    const { data, error } = await supabase.from("savings").insert({
      amount: saving.amountPaise / 100,
      amount_paise: saving.amountPaise,
      category_id: saving.categoryId,
      goal_id: saving.isGoalLinked ? saving.goalId : null,
      date: saving.date,
      saving_date: saving.date,
      note: saving.note,
      is_goal_linked: saving.isGoalLinked,
    }).select().single();

    if (error || !data) return null;

    return {
      id: data.id,
      amountPaise: Number(data.amount != null ? Math.round(Number(data.amount) * 100) : (data.amount_paise || 0)),
      categoryId: Number(data.category_id),
      goalId: data.goal_id ? Number(data.goal_id) : null,
      date: (data.date || data.saving_date || "").slice(0, 10),
      note: data.note || null,
      isGoalLinked: Boolean(data.is_goal_linked),
      createdAt: data.created_at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function insertSupabaseGoal(goal: Omit<Goal, "id">): Promise<Goal | null> {
  try {
    const { data, error } = await supabase.from("goals").insert({
      name: goal.name,
      icon: goal.icon,
      target_amount: goal.targetPaise / 100,
      target_paise: goal.targetPaise,
      starting_amount: goal.startingPaise / 100,
      starting_paise: goal.startingPaise,
      target_date: goal.targetDate,
      description: goal.description,
      is_main: goal.isMain,
    }).select().single();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      icon: data.icon,
      targetPaise: Number(data.target_amount != null ? Math.round(Number(data.target_amount) * 100) : (data.target_paise || 0)),
      startingPaise: Number(data.starting_amount != null ? Math.round(Number(data.starting_amount) * 100) : (data.starting_paise || 0)),
      targetDate: data.target_date || null,
      description: data.description || null,
      isMain: Boolean(data.is_main),
      createdAt: data.created_at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getUnifiedDb(): Promise<DBData> {
  const supabaseData = await fetchSupabaseData();
  if (supabaseData) {
    // Save cache locally for speed & offline access
    writeDb(supabaseData);
    return supabaseData;
  }
  return readDb();
}
