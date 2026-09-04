import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateCategoryBody,
  CreateCategoryResponse,
  CreateGoalBody,
  CreateGoalResponse,
  CreateSavingBody,
  CreateSavingResponse,
  DeleteCategoryParams,
  DeleteGoalParams,
  DeleteSavingParams,
  GetAnalyticsQueryParams,
  GetAnalyticsResponse,
  GetDashboardResponse,
  ListCategoriesResponse,
  ListGoalsResponse,
  ListSavingsQueryParams,
  ListSavingsResponse,
  UpdateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryResponse,
  UpdateGoalBody,
  UpdateGoalParams,
  UpdateGoalResponse,
  UpdateSavingBody,
  UpdateSavingParams,
  UpdateSavingResponse,
} from "@workspace/api-zod";
import { readDb, writeDb, type Goal, type Saving } from "../lib/json-db";
import { getUnifiedDb, insertSupabaseSaving, insertSupabaseGoal } from "../lib/supabase-db";

const router: IRouter = Router();

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number): string {
  const value = new Date(`${dateString}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function startOfWeek(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(dateString, diff);
}

function calculateGoalSavedPaise(goalId: number, savings: Saving[], startingPaise: number): number {
  const linkedSavingsSum = savings
    .filter((s) => s.isGoalLinked && s.goalId === goalId)
    .reduce((sum, s) => sum + s.amountPaise, 0);
  return startingPaise + linkedSavingsSum;
}

function calculateStreak(savings: Saving[]) {
  if (!savings || savings.length === 0) return { current: 0, best: 0 };
  const dates = Array.from(new Set(savings.map((s) => s.date.slice(0, 10))))
    .filter(Boolean)
    .sort()
    .reverse();

  if (dates.length === 0) return { current: 0, best: 0 };

  const dateSet = new Set(dates);
  const todayStr = todayString();
  const yesterdayStr = addDays(todayStr, -1);

  let current = 0;
  let checkDateStr = "";

  if (dateSet.has(todayStr)) {
    checkDateStr = todayStr;
  } else if (dateSet.has(yesterdayStr)) {
    checkDateStr = yesterdayStr;
  }

  if (checkDateStr) {
    let runner = checkDateStr;
    while (dateSet.has(runner)) {
      current++;
      runner = addDays(runner, -1);
    }
  }

  // Best streak
  const sortedAsc = Array.from(dateSet).sort();
  let best = 0;
  let run = 0;

  for (let i = 0; i < sortedAsc.length; i++) {
    if (i === 0) {
      run = 1;
    } else {
      const expectedPrev = addDays(sortedAsc[i], -1);
      if (sortedAsc[i - 1] === expectedPrev) {
        run++;
      } else {
        run = 1;
      }
    }
    if (run > best) best = run;
  }

  return { current, best };
}

// GET /dashboard
router.get("/dashboard", async (req: Request, res: Response): Promise<void> => {
  const db = await getUnifiedDb();
  const today = todayString();
  const weekStart = startOfWeek(today);
  const monthStart = `${today.slice(0, 8)}01`;

  // Goal shapes
  const goals = db.goals.map((g) => ({
    ...g,
    targetDate: g.targetDate ? new Date(g.targetDate) : null,
    createdAt: new Date(g.createdAt),
    savedPaise: calculateGoalSavedPaise(g.id, db.savings, g.startingPaise),
  }));

  const mainGoal = goals.find((g) => g.isMain) ?? null;

  // Category shapes
  const categories = db.categories.map((cat) => {
    const catSavings = db.savings.filter((s) => s.categoryId === cat.id);
    const totalPaise = catSavings.reduce((sum, s) => sum + s.amountPaise, 0);
    const linkedPaise = catSavings.filter((s) => s.isGoalLinked).reduce((sum, s) => sum + s.amountPaise, 0);
    return {
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      totalPaise,
      linkedPaise,
      entryCount: catSavings.length,
    };
  });

  // Recent savings
  const recentSavings = db.savings
    .map((s) => {
      const cat = db.categories.find((c) => c.id === s.categoryId);
      const goal = db.goals.find((g) => g.id === s.goalId);
      return {
        id: s.id,
        amountPaise: s.amountPaise,
        categoryId: s.categoryId,
        categoryName: cat?.name || "Other",
        categoryIcon: cat?.icon || "coins",
        goalId: s.isGoalLinked ? s.goalId : null,
        goalName: s.isGoalLinked && goal ? goal.name : null,
        date: new Date(s.date),
        note: s.note,
        isGoalLinked: s.isGoalLinked,
        createdAt: new Date(s.createdAt),
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  // Summary (includes ALL savings, whether goal-linked or flexible!)
  const todayPaise = db.savings
    .filter((s) => s.date.slice(0, 10) === today)
    .reduce((sum, s) => sum + s.amountPaise, 0);

  const weekPaise = db.savings
    .filter((s) => s.date.slice(0, 10) >= weekStart && s.date.slice(0, 10) <= today)
    .reduce((sum, s) => sum + s.amountPaise, 0);

  const monthPaise = db.savings
    .filter((s) => s.date.slice(0, 10) >= monthStart && s.date.slice(0, 10) <= today)
    .reduce((sum, s) => sum + s.amountPaise, 0);

  const totalPaise = db.savings.reduce((sum, s) => sum + s.amountPaise, 0);

  const streak = calculateStreak(db.savings);

  const topCategory = categories
    .filter((c) => c.totalPaise > 0)
    .sort((a, b) => b.totalPaise - a.totalPaise)[0];

  const insight = topCategory && monthPaise > 0
    ? `${topCategory.name} is your top source of savings this month!`
    : null;

  const payload = {
    mainGoal,
    goals,
    categories,
    recentSavings,
    summary: { todayPaise, weekPaise, monthPaise, totalPaise },
    streak,
    insight,
  };

  res.json(GetDashboardResponse.parse(payload));
});

// GET /goals
router.get("/goals", async (req: Request, res: Response): Promise<void> => {
  const db = await getUnifiedDb();
  const goals = db.goals.map((g) => ({
    ...g,
    targetDate: g.targetDate ? new Date(g.targetDate) : null,
    createdAt: new Date(g.createdAt),
    savedPaise: calculateGoalSavedPaise(g.id, db.savings, g.startingPaise),
  }));
  res.json(ListGoalsResponse.parse(goals));
});

// POST /goals
router.post("/goals", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid goal parameters." });
    return;
  }
  const db = readDb();
  const body = parsed.data;

  if (body.isMain) {
    db.goals.forEach((g) => {
      g.isMain = false;
    });
  }

  const newGoal: Goal = {
    id: db.goals.length ? Math.max(...db.goals.map((g) => g.id)) + 1 : 1,
    name: body.name,
    icon: body.icon,
    targetPaise: body.targetPaise,
    startingPaise: body.startingPaise,
    targetDate: body.targetDate ? new Date(body.targetDate).toISOString().slice(0, 10) : null,
    description: body.description || null,
    isMain: db.goals.length === 0 || body.isMain,
    createdAt: new Date().toISOString(),
  };

  db.goals.push(newGoal);
  writeDb(db);

  const payload = {
    ...newGoal,
    targetDate: newGoal.targetDate ? new Date(newGoal.targetDate) : null,
    createdAt: new Date(newGoal.createdAt),
    savedPaise: newGoal.startingPaise,
  };
  res.status(201).json(CreateGoalResponse.parse(payload));
});

// PATCH /goals/:id
router.patch("/goals/:id", async (req: Request, res: Response): Promise<void> => {
  const params = UpdateGoalParams.safeParse(req.params);
  const parsed = UpdateGoalBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid parameters." });
    return;
  }

  const db = readDb();
  const goalIndex = db.goals.findIndex((g) => g.id === params.data.id);
  if (goalIndex === -1) {
    res.status(404).json({ error: "Goal not found." });
    return;
  }

  const body = parsed.data;

  if (body.isMain) {
    db.goals.forEach((g) => {
      g.isMain = false;
    });
  }

  const existing = db.goals[goalIndex];
  const updated: Goal = {
    ...existing,
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.icon !== undefined ? { icon: body.icon } : {}),
    ...(body.targetPaise !== undefined ? { targetPaise: body.targetPaise } : {}),
    ...(body.targetDate !== undefined ? { targetDate: body.targetDate ? new Date(body.targetDate).toISOString().slice(0, 10) : null } : {}),
    ...(body.description !== undefined ? { description: body.description || null } : {}),
    ...(body.isMain !== undefined ? { isMain: body.isMain } : {}),
  };

  db.goals[goalIndex] = updated;
  writeDb(db);

  const payload = {
    ...updated,
    targetDate: updated.targetDate ? new Date(updated.targetDate) : null,
    createdAt: new Date(updated.createdAt),
    savedPaise: calculateGoalSavedPaise(updated.id, db.savings, updated.startingPaise),
  };

  res.json(UpdateGoalResponse.parse(payload));
});

// DELETE /goals/:id
router.delete("/goals/:id", async (req: Request, res: Response): Promise<void> => {
  const params = DeleteGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid goal id." });
    return;
  }
  const db = readDb();
  db.goals = db.goals.filter((g) => g.id !== params.data.id);
  writeDb(db);
  res.sendStatus(204);
});

// GET /categories
router.get("/categories", async (req: Request, res: Response): Promise<void> => {
  const db = await getUnifiedDb();
  const categories = db.categories.map((cat) => {
    const catSavings = db.savings.filter((s) => s.categoryId === cat.id);
    return {
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      totalPaise: catSavings.reduce((sum, s) => sum + s.amountPaise, 0),
      linkedPaise: catSavings.filter((s) => s.isGoalLinked).reduce((sum, s) => sum + s.amountPaise, 0),
      entryCount: catSavings.length,
    };
  });
  res.json(ListCategoriesResponse.parse(categories));
});

// POST /categories
router.post("/categories", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid category body." });
    return;
  }
  const db = readDb();
  const body = parsed.data;
  const newCat = {
    id: db.categories.length ? Math.max(...db.categories.map((c) => c.id)) + 1 : 1,
    name: body.name,
    icon: body.icon,
    createdAt: new Date().toISOString(),
  };
  db.categories.push(newCat);
  writeDb(db);

  res.status(201).json(
    CreateCategoryResponse.parse({
      ...newCat,
      totalPaise: 0,
      linkedPaise: 0,
      entryCount: 0,
    }),
  );
});

// PATCH /categories/:id
router.patch("/categories/:id", async (req: Request, res: Response): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid parameters." });
    return;
  }
  const db = readDb();
  const index = db.categories.findIndex((c) => c.id === params.data.id);
  if (index === -1) {
    res.status(404).json({ error: "Category not found." });
    return;
  }
  db.categories[index] = {
    ...db.categories[index],
    ...(parsed.data.name ? { name: parsed.data.name } : {}),
    ...(parsed.data.icon ? { icon: parsed.data.icon } : {}),
  };
  writeDb(db);

  const cat = db.categories[index];
  const catSavings = db.savings.filter((s) => s.categoryId === cat.id);
  res.json(
    UpdateCategoryResponse.parse({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      totalPaise: catSavings.reduce((sum, s) => sum + s.amountPaise, 0),
      linkedPaise: catSavings.filter((s) => s.isGoalLinked).reduce((sum, s) => sum + s.amountPaise, 0),
      entryCount: catSavings.length,
    }),
  );
});

// DELETE /categories/:id
router.delete("/categories/:id", async (req: Request, res: Response): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid category ID." });
    return;
  }
  const db = readDb();
  db.categories = db.categories.filter((c) => c.id !== params.data.id);
  writeDb(db);
  res.sendStatus(204);
});

// GET /savings
router.get("/savings", async (req: Request, res: Response): Promise<void> => {
  const parsed = ListSavingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query filters." });
    return;
  }
  const db = await getUnifiedDb();
  const filters = parsed.data;

  let result = db.savings;
  if (filters.categoryId != null) {
    result = result.filter((s) => s.categoryId === filters.categoryId);
  }
  if (filters.goalId != null) {
    result = result.filter((s) => s.goalId === filters.goalId);
  }
  if (filters.from) {
    const fromStr = new Date(filters.from).toISOString().slice(0, 10);
    result = result.filter((s) => s.date.slice(0, 10) >= fromStr);
  }
  if (filters.to) {
    const toStr = new Date(filters.to).toISOString().slice(0, 10);
    result = result.filter((s) => s.date.slice(0, 10) <= toStr);
  }

  const shapes = result
    .map((s) => {
      const cat = db.categories.find((c) => c.id === s.categoryId);
      const goal = db.goals.find((g) => g.id === s.goalId);
      return {
        id: s.id,
        amountPaise: s.amountPaise,
        categoryId: s.categoryId,
        categoryName: cat?.name || "Other",
        categoryIcon: cat?.icon || "coins",
        goalId: s.isGoalLinked ? s.goalId : null,
        goalName: s.isGoalLinked && goal ? goal.name : null,
        date: new Date(s.date),
        note: s.note,
        isGoalLinked: s.isGoalLinked,
        createdAt: new Date(s.createdAt),
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.json(ListSavingsResponse.parse(shapes));
});

// POST /savings
router.post("/savings", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateSavingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid saving entry." });
    return;
  }
  const db = readDb();
  const body = parsed.data;

  const dateStr = new Date(body.date).toISOString().slice(0, 10);

  const newSaving: Saving = {
    id: db.savings.length ? Math.max(...db.savings.map((s) => s.id)) + 1 : 1,
    amountPaise: body.amountPaise,
    categoryId: body.categoryId,
    goalId: body.isGoalLinked ? (body.goalId ?? null) : null,
    date: dateStr,
    note: body.note || null,
    isGoalLinked: body.isGoalLinked,
    createdAt: new Date().toISOString(),
  };

  db.savings.push(newSaving);
  writeDb(db);
  insertSupabaseSaving(newSaving).catch(() => {});

  const cat = db.categories.find((c) => c.id === newSaving.categoryId);
  const goal = db.goals.find((g) => g.id === newSaving.goalId);

  const shape = {
    id: newSaving.id,
    amountPaise: newSaving.amountPaise,
    categoryId: newSaving.categoryId,
    categoryName: cat?.name || "Other",
    categoryIcon: cat?.icon || "coins",
    goalId: newSaving.isGoalLinked ? newSaving.goalId : null,
    goalName: newSaving.isGoalLinked && goal ? goal.name : null,
    date: new Date(newSaving.date),
    note: newSaving.note,
    isGoalLinked: newSaving.isGoalLinked,
    createdAt: new Date(newSaving.createdAt),
  };

  res.status(201).json(CreateSavingResponse.parse(shape));
});

// PATCH /savings/:id
router.patch("/savings/:id", async (req: Request, res: Response): Promise<void> => {
  const params = UpdateSavingParams.safeParse(req.params);
  const parsed = UpdateSavingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid parameters." });
    return;
  }
  const db = readDb();
  const index = db.savings.findIndex((s) => s.id === params.data.id);
  if (index === -1) {
    res.status(404).json({ error: "Saving transaction not found." });
    return;
  }

  const existing = db.savings[index];
  const body = parsed.data;

  const isGoalLinked = body.isGoalLinked !== undefined ? body.isGoalLinked : existing.isGoalLinked;
  const goalId = isGoalLinked ? (body.goalId !== undefined ? body.goalId : existing.goalId) : null;

  const updated: Saving = {
    ...existing,
    ...(body.amountPaise !== undefined ? { amountPaise: body.amountPaise } : {}),
    ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
    isGoalLinked,
    goalId,
    ...(body.date !== undefined ? { date: new Date(body.date).toISOString().slice(0, 10) } : {}),
    ...(body.note !== undefined ? { note: body.note || null } : {}),
  };

  db.savings[index] = updated;
  writeDb(db);

  const cat = db.categories.find((c) => c.id === updated.categoryId);
  const goal = db.goals.find((g) => g.id === updated.goalId);

  const shape = {
    id: updated.id,
    amountPaise: updated.amountPaise,
    categoryId: updated.categoryId,
    categoryName: cat?.name || "Other",
    categoryIcon: cat?.icon || "coins",
    goalId: updated.isGoalLinked ? updated.goalId : null,
    goalName: updated.isGoalLinked && goal ? goal.name : null,
    date: new Date(updated.date),
    note: updated.note,
    isGoalLinked: updated.isGoalLinked,
    createdAt: new Date(updated.createdAt),
  };

  res.json(UpdateSavingResponse.parse(shape));
});

// DELETE /savings/:id
router.delete("/savings/:id", async (req: Request, res: Response): Promise<void> => {
  const params = DeleteSavingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid saving ID." });
    return;
  }
  const db = readDb();
  db.savings = db.savings.filter((s) => s.id !== params.data.id);
  writeDb(db);
  res.sendStatus(204);
});

// GET /analytics
router.get("/analytics", async (req: Request, res: Response): Promise<void> => {
  const parsed = GetAnalyticsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid range query." });
    return;
  }
  const db = await getUnifiedDb();
  const range = parsed.data.range || "30d";
  const end = todayString();
  const start =
    range === "7d"
      ? addDays(end, -6)
      : range === "30d"
      ? addDays(end, -29)
      : range === "3m"
      ? addDays(end, -89)
      : range === "6m"
      ? addDays(end, -179)
      : range === "1y"
      ? addDays(end, -364)
      : "0000-01-01";

  const filtered = db.savings.filter(
    (s) => s.date.slice(0, 10) >= start && s.date.slice(0, 10) <= end,
  );

  const byCategoryMap = new Map<string, { name: string; icon: string; totalPaise: number }>();
  const byDayMap = new Map<string, number>();

  for (const s of filtered) {
    const cat = db.categories.find((c) => c.id === s.categoryId);
    const catName = cat?.name || "Other";
    const catIcon = cat?.icon || "coins";

    const currCat = byCategoryMap.get(catName) || { name: catName, icon: catIcon, totalPaise: 0 };
    currCat.totalPaise += s.amountPaise;
    byCategoryMap.set(catName, currCat);

    const dayStr = s.date.slice(0, 10);
    byDayMap.set(dayStr, (byDayMap.get(dayStr) || 0) + s.amountPaise);
  }

  const dayTotals = [...byDayMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const totalPaise = filtered.reduce((sum, s) => sum + s.amountPaise, 0);
  const bestDayStr = dayTotals.length
    ? [...byDayMap.entries()].sort(([, a], [, b]) => b - a)[0][0]
    : null;

  const payload = {
    range,
    totalPaise,
    averagePaise: dayTotals.length ? Math.round(totalPaise / dayTotals.length) : 0,
    bestDay: bestDayStr ? new Date(bestDayStr) : null,
    byCategory: [...byCategoryMap.values()].sort((a, b) => b.totalPaise - a.totalPaise),
    byDay: dayTotals.map(([date, totalPaise]) => ({ date: new Date(date), totalPaise })),
  };

  res.json(GetAnalyticsResponse.parse(payload));
});

export default router;