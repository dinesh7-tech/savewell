import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://syjnmyajujzbzyygqznb.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5am5teWFqdWp6Ynp5eWdxem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MzA1NjQsImV4cCI6MjEwNDEwNjU2NH0.ndtImWH9xcxHnf5h6Qi_z598NFW6dUmElHBGnu8EgIM';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
