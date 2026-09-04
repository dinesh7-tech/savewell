import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://syjnmyajujzbzyygqznb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5am5teWFqdWp6Ynp5eWdxem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MzA1NjQsImV4cCI6MjEwNDEwNjU2NH0.ndtImWH9xcxHnf5h6Qi_z598NFW6dUmElHBGnu8EgIM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  console.log("Testing Supabase connection...");
  const { data, error } = await supabase.from("categories").select("*");
  console.log("Categories response:", { data, error });
}

test();
