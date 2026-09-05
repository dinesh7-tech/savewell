import fs from "fs";
import path from "path";

export interface Category {
  id: number;
  name: string;
  icon: string;
  createdAt: string;
}

export interface Goal {
  id: number;
  name: string;
  icon: string;
  targetPaise: number;
  startingPaise: number;
  targetDate: string | null;
  description: string | null;
  isMain: boolean;
  createdAt: string;
}

export interface Saving {
  id: number;
  amountPaise: number;
  categoryId: number;
  goalId: number | null;
  date: string; // YYYY-MM-DD
  note: string | null;
  isGoalLinked: boolean;
  createdAt: string;
}

export interface DBData {
  categories: Category[];
  goals: Goal[];
  savings: Saving[];
}

const dataDir = path.resolve(process.cwd(), "data");
const dbFilePath = path.join(dataDir, "savewell_db.json");

function ensureDbFile(): DBData {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dbFilePath)) {
    const initial: DBData = {
      categories: [],
      goals: [],
      savings: [],
    };
    fs.writeFileSync(dbFilePath, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }

  try {
    const raw = fs.readFileSync(dbFilePath, "utf-8");
    const data = JSON.parse(raw);
    if (!data.categories) data.categories = [];
    if (!data.goals) data.goals = [];
    if (!data.savings) data.savings = [];
    return data;
  } catch (err) {
    const initial: DBData = {
      categories: [],
      goals: [],
      savings: [],
    };
    fs.writeFileSync(dbFilePath, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }
}

export function readDb(): DBData {
  return ensureDbFile();
}

export function writeDb(data: DBData): void {
  ensureDbFile();
  fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), "utf-8");
}
