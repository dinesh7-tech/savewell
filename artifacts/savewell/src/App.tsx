import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, BarChart3, Calendar as CalendarIcon, Check, CircleDollarSign,
  CloudDownload, Edit3, Flame, Home, ListFilter, Loader2,
  LogOut, Menu, Moon, Pencil, Plus, Search, Settings,
  Sparkles, Sun, Target, Trash2, TrendingUp, Wallet, X, Zap, Eye, EyeOff, Info, Clock, AlertCircle, WifiOff,
  HandCoins, PiggyBank, Receipt, ChevronLeft, ChevronRight, History, CheckCircle2, AlertTriangle, PieChart as PieChartIcon, Layers,
  Bell, CreditCard, ArrowDownLeft, ArrowUpRight, FileText, Printer
} from 'lucide-react';
import React, { useEffect, useMemo, useState, createContext, useContext } from 'react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip,
  BarChart, Bar
} from 'recharts';
import { generateMonthlyReportPdf, openPrintableMonthlyReport, type MonthlyReportData } from '@/lib/pdfReport';
import { supabase } from '@/lib/supabase';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import './index.css';

// ---------------------------------------------------------------------------
// Query Client Setup
// ---------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
      staleTime: 1000 * 5,
    },
  },
});

// ---------------------------------------------------------------------------
// Currency & Formatting Utilities (Indian Numbering System)
// ---------------------------------------------------------------------------
export function formatINR(amount: number | string | null | undefined): string {
  const num = Number(amount || 0);
  if (num === 0) return '₹0';

  const parts = Math.round(num).toString().split('.');
  let lastThree = parts[0].substring(parts[0].length - 3);
  const otherNumbers = parts[0].substring(0, parts[0].length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  return `₹${formatted}`;
}

const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date set';
const shortDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
const todayStr = () => new Date().toISOString().slice(0, 10);
const pct = (saved: number, target: number) => target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;

export function formatDueCountdown(dueDateStr?: string | null): { text: string; isOverdue: boolean; isToday: boolean; daysDiff: number } | null {
  if (!dueDateStr) return null;
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const targetDate = new Date(dueDateStr);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - todayDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return {
      text: `Overdue by ${days} ${days === 1 ? 'day' : 'days'}`,
      isOverdue: true,
      isToday: false,
      daysDiff: diffDays,
    };
  } else if (diffDays === 0) {
    return {
      text: 'Due Today',
      isOverdue: false,
      isToday: true,
      daysDiff: 0,
    };
  } else {
    return {
      text: `Due in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
      isOverdue: false,
      isToday: false,
      daysDiff: diffDays,
    };
  }
}

export function sortBorrowedRecords(records: any[]): any[] {
  return [...records].sort((a, b) => {
    // 1. Paid items at the bottom
    const aPaid = a.computed_status === 'Paid';
    const bPaid = b.computed_status === 'Paid';
    if (aPaid && !bPaid) return 1;
    if (!aPaid && bPaid) return -1;
    if (aPaid && bPaid) {
      return (b.borrowed_date || '').localeCompare(a.borrowed_date || '');
    }

    // 2. Overdue records first
    const aOverdue = a.is_overdue;
    const bOverdue = b.is_overdue;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    if (aOverdue && bOverdue) {
      return (a.due_date || '').localeCompare(b.due_date || '');
    }

    // 3. Due soon (has due date)
    const aHasDue = Boolean(a.due_date);
    const bHasDue = Boolean(b.due_date);
    if (aHasDue && !bHasDue) return -1;
    if (!aHasDue && bHasDue) return 1;
    if (aHasDue && bHasDue) {
      return (a.due_date || '').localeCompare(b.due_date || '');
    }

    // 4. No due date -> newest borrowed_date first
    return (b.borrowed_date || '').localeCompare(a.borrowed_date || '');
  });
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning 👋';
  if (hour < 17) return 'Good afternoon 👋';
  return 'Good evening 👋';
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function isSchemaCacheError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('schema cache') || msg.includes('relation') || msg.includes('does not exist') || err.code === 'PGRST204' || err.code === '42P01';
}

// ---------------------------------------------------------------------------
// Network Status Hook
// ---------------------------------------------------------------------------
function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// ---------------------------------------------------------------------------
// Supabase Authentication Context
// ---------------------------------------------------------------------------
interface AuthContextType {
  user: any | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<{ error: any }>;
  signUp: (email: string, pass: string, name: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      queryClient.invalidateQueries();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, pass: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    return { error };
  };

  const signUp = async (email: string, pass: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: { data: { full_name: name.trim() } },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    return { error };
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

// ---------------------------------------------------------------------------
// Supabase Realtime Subscription Hook
// ---------------------------------------------------------------------------
function useSupabaseRealtime(userId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user-realtime-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

// ---------------------------------------------------------------------------
// SaveWell Logo & Icon Vector System
// ---------------------------------------------------------------------------
export function SaveWellIcon({
  size = 36,
  className = '',
  light = false,
  variant = 'badge',
}: {
  size?: number;
  className?: string;
  light?: boolean;
  variant?: 'badge' | 'glyph';
}) {
  const isBadge = variant === 'badge';
  const tileFill = light ? '#e8dccb' : '#1b382b';
  const strokeColor = light ? '#1b382b' : '#fcfaf5';
  const accentColor = '#c6784e';

  if (!isBadge) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="SaveWell Icon"
        className={`shrink-0 ${className}`}
      >
        <path
          d="M23.5 11C23.5 11 15 10.5 13 14.5C11.2 18.2 15.8 19.8 18.5 20.8C21.8 22 25 23.5 25 27.2C25 31.2 20.2 32.5 15.5 32.5C11.5 32.5 10.5 29.5 10.5 29.5"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="26" cy="10" r="2.4" fill={accentColor} />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SaveWell Icon"
      className={`shrink-0 transition-transform ${className}`}
    >
      <rect width="36" height="36" rx="10" fill={tileFill} />
      <path
        d="M23.5 11C23.5 11 15 10.5 13 14.5C11.2 18.2 15.8 19.8 18.5 20.8C21.8 22 25 23.5 25 27.2C25 31.2 20.2 32.5 15.5 32.5C11.5 32.5 10.5 29.5 10.5 29.5"
        stroke={strokeColor}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="10" r="2.4" fill={accentColor} />
    </svg>
  );
}

export function Brand({
  light = false,
  size = 'md',
  className = '',
}: {
  light?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const iconSizes = { sm: 28, md: 36, lg: 44 };
  const textSizes = {
    sm: 'text-lg',
    md: 'text-[22px]',
    lg: 'text-3xl sm:text-4xl',
  };

  return (
    <Link
      href="/"
      aria-label="SaveWell Home"
      className={`inline-flex items-center gap-2.5 select-none ${
        light ? 'text-[#fbf5e8]' : 'text-foreground'
      } ${className}`}
    >
      <SaveWellIcon size={iconSizes[size]} light={light} />
      <span className={`font-display font-bold leading-none tracking-[-0.035em] ${textSizes[size]}`}>
        Save<span className={light ? 'text-accent' : 'text-[#b86e48]'}>Well</span>
      </span>
    </Link>
  );
}

export function FooterCredit({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center text-center ${className}`}>
      <a
        href="https://dineshpicks.in"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block font-mono-ui text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/75 hover:text-foreground transition-colors"
      >
        CREATED BY DINESHPICKS.IN
      </a>
    </div>
  );
}

function Button({ children, variant = 'primary', className = '', ...props }: any) {
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]',
    soft: 'bg-secondary text-secondary-foreground hover:bg-[#cfe9df] active:scale-[0.98]',
    outline: 'border border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted active:scale-[0.98]',
    ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.98]',
    danger: 'border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 active:scale-[0.98]',
  };
  return (
    <button className={`touch-target inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-150 ${styles[variant as keyof typeof styles]} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Field({ label, ...props }: any) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground">
      {label && <span>{label}</span>}
      <input className="h-12 rounded-xl border border-input bg-card px-3.5 text-base outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15" {...props} />
    </label>
  );
}

function Modal({ title, eyebrow, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center bg-foreground/40 p-0 backdrop-blur-sm safe-area-bottom sm:p-5" role="dialog" aria-modal="true">
      <div className="animate-sheet-up max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-card p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-7">
        <div className="mb-4 flex items-start justify-between gap-4 sticky top-0 bg-card pt-1 pb-2 z-10 border-b border-border/40">
          <div>
            <p className="font-mono-ui text-[10px] font-medium uppercase tracking-[.18em] text-muted-foreground">{eyebrow}</p>
            <h2 className="mt-0.5 font-display text-2xl sm:text-3xl tracking-[-.035em]">{title}</h2>
          </div>
          <button className="touch-target grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  eyebrow = 'Confirmation',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  icon: Icon = AlertTriangle,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string | React.ReactNode;
  eyebrow?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  icon?: any;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [submitting, onClose]);

  const handleConfirm = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      console.error('Confirm action error:', err);
      setError(err?.message || 'Action failed. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center bg-foreground/40 p-0 backdrop-blur-sm safe-area-bottom sm:p-5"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="animate-sheet-up w-full rounded-t-[28px] border border-border bg-card p-5 shadow-2xl sm:max-w-md sm:rounded-[28px] sm:p-6">
        <div className="flex items-start gap-3.5">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
            variant === 'danger' ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary'
          }`}>
            <Icon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono-ui text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">{eyebrow}</p>
            <h2 className="mt-0.5 font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground">{title}</h2>
          </div>
          <button
            disabled={submitting}
            className="touch-target grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-3.5 text-sm text-muted-foreground leading-relaxed">
          {message}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2.5">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onClose}
            className="flex-1 h-11 text-xs font-semibold"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'danger' ? 'danger' : 'primary'}
            disabled={submitting}
            onClick={handleConfirm}
            className="flex-1 h-11 text-xs font-bold"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            {submitting ? 'Processing...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, body, action, icon: Icon = Sparkles }: any) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
        <Icon size={21} />
      </span>
      <h3 className="font-display text-2xl">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="h-44 animate-pulse rounded-3xl bg-muted" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-28 animate-pulse rounded-2xl bg-muted" />
        <div className="h-28 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing Page
// ---------------------------------------------------------------------------
function Landing() {
  const { user } = useAuth();
  return (
    <div className="min-h-[100dvh] flex flex-col justify-between overflow-hidden">
      <header className="mx-auto w-full flex max-w-7xl items-center justify-between px-5 py-5 lg:px-10">
        <Brand />
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/dashboard" className="touch-target inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:-translate-y-0.5">
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className="touch-target inline-flex items-center justify-center rounded-xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted">
                Sign in
              </Link>
              <Link href="/sign-up" className="touch-target inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:-translate-y-0.5">
                Start saving
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="flex-1">
        <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-20">
          <div className="rise-in">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 font-mono-ui text-[10px] uppercase tracking-[.16em] text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-[#72b799]" /> Complete Personal Money & Savings Tracker
            </div>
            <h1 className="max-w-2xl font-display text-[clamp(3.6rem,8vw,7.2rem)] leading-[.93] tracking-[-.07em]">
              Small steps.<br /><span className="text-[#b86e48]">Real somewhere.</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-muted-foreground">
              SaveWell turns the money you set aside into a clear, encouraging picture of what you’re building in real-time with savings, goals, monthly budgets, and lending tracking.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={user ? "/dashboard" : "/sign-up"} className="touch-target group inline-flex items-center gap-3 rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground hover:-translate-y-0.5 hover:shadow-lg">
                Start your savings space <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
          <div className="relative rise-in-delay">
            <div className="relative rotate-[2deg] rounded-[2rem] bg-primary p-3 shadow-2xl shadow-primary/20">
              <div className="rounded-[1.5rem] bg-[#f5ead8] p-5 sm:p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground">Main Goal Example</p>
                    <h2 className="mt-2 font-display text-3xl">💻 Laptop</h2>
                  </div>
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#d6ebdf] text-[#39715c]">
                    <Target size={23} />
                  </span>
                </div>
                <div className="mt-9 flex items-end justify-between">
                  <div>
                    <p className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Saved so far</p>
                    <p className="mt-1 font-display text-5xl">₹24,500</p>
                  </div>
                  <p className="mb-1 font-mono-ui text-sm text-[#39715c]">24.5%</p>
                </div>
                <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#e4d4bd]">
                  <div className="h-full w-[24.5%] rounded-full bg-[#c6784e]" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-border/40 py-8 px-5">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <Brand size="sm" />
          <FooterCredit />
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth Page (Sign In, Sign Up, Forgot Password)
// ---------------------------------------------------------------------------
function AuthPage({ mode = 'sign-in' }: { mode?: 'sign-in' | 'sign-up' | 'forgot' }) {
  const [, setLocation] = useLocation();
  const { user, signIn, signUp, resetPassword } = useAuth();
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up' | 'forgot'>(mode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);

    if (authMode === 'forgot') {
      const { error } = await resetPassword(email);
      setSubmitting(false);
      if (error) setError(error.message);
      else setInfo('Password reset email sent! Check your inbox.');
      return;
    }

    if (authMode === 'sign-up') {
      const { error } = await signUp(email, password, name);
      setSubmitting(false);
      if (error) {
        setError(error.message);
      } else {
        setInfo('Account created! Sign in to enter your savings space.');
        setAuthMode('sign-in');
      }
      return;
    }

    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError(error.message);
    } else {
      setLocation('/dashboard');
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[440px] rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto flex justify-center">
            <SaveWellIcon size={52} />
          </div>
          <p className="mt-3 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">SaveWell</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight">
            {authMode === 'sign-up' ? 'Create Account' : authMode === 'forgot' ? 'Reset Password' : 'Welcome Back'}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {authMode === 'sign-up' ? 'Start your personal savings space' : authMode === 'forgot' ? 'Enter your email to receive a reset link' : 'Sign in to access your real-time savings'}
          </p>

          {authMode !== 'forgot' && (
            <div className="mt-5 flex rounded-xl border border-border bg-muted p-1">
              <button
                type="button"
                className={`touch-target flex-1 rounded-lg py-2 text-xs font-semibold transition ${authMode === 'sign-in' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => { setAuthMode('sign-in'); setError(''); setInfo(''); }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`touch-target flex-1 rounded-lg py-2 text-xs font-semibold transition ${authMode === 'sign-up' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => { setAuthMode('sign-up'); setError(''); setInfo(''); }}
              >
                Create Account
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {authMode === 'sign-up' && (
            <Field
              label="Full Name"
              type="text"
              required
              value={name}
              onChange={(e: any) => setName(e.target.value)}
              placeholder="e.g. Alex Morgan"
            />
          )}

          <Field
            label="Email address"
            type="email"
            required
            value={email}
            onChange={(e: any) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />

          {authMode !== 'forgot' && (
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              <div className="flex items-center justify-between">
                <span>Password</span>
                {authMode === 'sign-in' && (
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setAuthMode('forgot')}>
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full rounded-xl border border-input bg-card px-3.5 pr-10 text-base outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  className="touch-target absolute right-1 top-1 grid h-10 w-10 place-items-center text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
              {error}
            </div>
          )}

          {info && (
            <div className="rounded-xl border border-[#39715c]/30 bg-[#39715c]/10 p-3 text-xs font-semibold text-[#39715c]">
              {info}
            </div>
          )}

          <Button type="submit" disabled={submitting} className="mt-2 w-full h-12 text-base">
            {submitting ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
            {submitting ? 'Please wait...' : authMode === 'sign-up' ? 'Create Account' : authMode === 'forgot' ? 'Send Reset Link' : 'Sign In'}
          </Button>

          {authMode === 'forgot' && (
            <button type="button" className="touch-target mt-2 text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => setAuthMode('sign-in')}>
              Back to Sign In
            </button>
          )}
        </form>
      </div>
      <div className="mt-6 text-center">
        <FooterCredit />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell Layout (Sidebar & Bottom Navigation)
// ---------------------------------------------------------------------------
function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const isOnline = useNetworkStatus();

  useSupabaseRealtime(user?.id);

  if (!user) {
    return <Redirect to="/sign-in" />;
  }

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const initials = (displayName.charAt(0) || 'U').toUpperCase();

  const links = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/savings', label: 'Savings', icon: CircleDollarSign },
    { href: '/goals', label: 'Goals', icon: Target },
    { href: '/budget', label: 'Budget', icon: PiggyBank },
    { href: '/money-lent', label: 'Money Lent', icon: HandCoins },
    { href: '/borrowed', label: 'Money I Owe', icon: Receipt },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/categories', label: 'Categories', icon: Wallet },
    { href: '/settings', label: 'Profile', icon: Settings },
  ];

  return (
    <div className="savewell-grain flex min-h-[100dvh] bg-background">
      {/* Offline Alert Bar */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground shadow-md animate-bounce">
          <WifiOff size={16} />
          Connection lost. Your data will refresh when the connection returns.
        </div>
      )}

      {/* Desktop Sidebar & Mobile Drawer */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-200 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <Brand light />
        <div className="mt-8 flex-1 space-y-1 overflow-y-auto pr-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`touch-target flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                location === href || (href === '/savings' && location === '/activity')
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              }`}
            >
              <Icon size={19} />
              {label}
            </Link>
          ))}
        </div>
        <div className="border-t border-sidebar-border pt-4">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-sidebar-accent/60 p-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-primary">{initials}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate font-mono-ui text-[10px] text-sidebar-foreground/50">{user.email}</p>
              </div>
            </div>
            <button onClick={signOut} title="Sign out" className="touch-target grid h-8 w-8 place-items-center text-sidebar-foreground/60 hover:text-sidebar-foreground">
              <LogOut size={17} />
            </button>
          </div>
          <div className="mt-3 text-center">
            <FooterCredit className="opacity-60 hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </aside>

      {open && <button className="fixed inset-0 z-30 bg-foreground/30 backdrop-blur-xs md:hidden" onClick={() => setOpen(false)} aria-label="Close drawer" />}

      {/* Main Content Viewport */}
      <div className={`w-full pb-24 md:pl-[250px] md:pb-0 ${!isOnline ? 'pt-8' : ''}`}>
        <header className="sticky top-0 z-20 flex h-[64px] sm:h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-4 sm:px-6 lg:px-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button className="touch-target grid h-10 w-10 place-items-center rounded-lg hover:bg-muted md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
            <Brand size="sm" />
          </div>
          <div className="hidden md:block">
            <p className="font-mono-ui text-[10px] uppercase tracking-[.17em] text-muted-foreground">Personal Money Management</p>
            <p className="mt-0.5 text-sm font-semibold">{links.find(x => x.href === location)?.label || 'Overview'}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#4d846c] animate-pulse" />Live Realtime
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-bold text-primary">
              {initials}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</main>

        {/* Global Footer Credit */}
        <footer className="mx-auto max-w-[1240px] px-4 py-8 text-center border-t border-border/30 mt-8 mb-20 md:mb-4">
          <FooterCredit />
        </footer>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 border-t border-border/80 bg-background/95 backdrop-blur-xl md:hidden safe-area-bottom shadow-lg overflow-x-auto">
          {links.slice(0, 7).map(({ href, label, icon: Icon }) => {
            const isActive = location === href || (href === '/savings' && location === '/activity');
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 min-w-[56px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition-all ${
                  isActive
                    ? 'text-primary font-bold scale-105'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={19} className={isActive ? 'text-primary' : ''} />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transaction Detail Modal Sheet
// ---------------------------------------------------------------------------
function TransactionDetailModal({ saving, onClose, onDelete }: any) {
  if (!saving) return null;

  return (
    <Modal title="Deposit Details" eyebrow="Saving Record" onClose={onClose}>
      <div className="grid gap-5">
        <div className="rounded-2xl border border-border bg-secondary/30 p-5 text-center">
          <span className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-3xl">
            {saving.categories?.icon || '💰'}
          </span>
          <p className="text-sm font-semibold text-muted-foreground">{saving.categories?.name || 'Deposit'}</p>
          <p className="mt-1 font-display text-4xl sm:text-5xl font-bold text-[#39715c]">+{formatINR(saving.amount)}</p>
          <p className="mt-2 text-xs font-mono-ui text-muted-foreground">{dateLabel(saving.saving_date)}</p>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
          <div className="flex justify-between py-1 border-b border-border/40">
            <span className="text-muted-foreground">Source Category</span>
            <span className="font-semibold">{saving.categories?.name || 'General'}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border/40">
            <span className="text-muted-foreground">Goal Linked</span>
            <span className="font-semibold">
              {saving.is_goal_linked && saving.goals?.name ? `Target: ${saving.goals.name}` : 'Flexible (Not linked)'}
            </span>
          </div>
          {saving.note && (
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Note</span>
              <span className="font-semibold text-right max-w-[200px] truncate">{saving.note}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="danger" className="flex-1 h-12" onClick={() => onDelete(saving)}>
            <Trash2 size={17} /> Delete Saving
          </Button>
          <Button variant="outline" className="flex-1 h-12" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Category Modal Component (Create & Edit Money Source Categories)
// ---------------------------------------------------------------------------
function CategoryModal({ initial, onClose, onSubmit }: any) {
  const [name, setName] = useState(initial?.name || '');
  const [icon, setIcon] = useState(initial?.icon || '💰');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const PRESET_ICONS = ['💰', '💼', '💻', '📱', '🎨', '🏢', '🎁', '📈', '🚀', '⚡', '☕', '🏷️'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a category name (e.g. YouTube, Salary, Freelance).');
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit({
        name: trimmedName,
        icon: icon || '💰',
      });
    } catch (err: any) {
      console.error('Category save error:', err);
      setError(err?.message || 'Failed to save category. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal title={initial ? 'Edit Category' : 'New Savings Category'} eyebrow="Money Source" onClose={onClose}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <label className="text-sm font-semibold text-muted-foreground">Select or Type Icon</label>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="h-11 w-14 rounded-xl border border-input bg-card text-center text-xl outline-none focus:border-accent"
              value={icon}
              maxLength={4}
              onChange={(e) => setIcon(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5 flex-1">
              {PRESET_ICONS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => setIcon(emoji)}
                  className={`h-9 w-9 rounded-lg border text-lg transition flex items-center justify-center ${
                    icon === emoji ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'border-border bg-muted/40 hover:bg-muted'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Field
          label="Category Name (Source of Saving)"
          required
          autoFocus
          value={name}
          onChange={(e: any) => setName(e.target.value)}
          placeholder="e.g. YouTube, Salary, Freelance, Side Income"
        />

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        <Button disabled={submitting} type="submit" className="mt-2 w-full h-12">
          {submitting ? <Loader2 className="animate-spin" size={17} /> : null}
          {initial ? (submitting ? 'Updating...' : 'Update Category') : (submitting ? 'Creating...' : 'Create Category')}
          {!submitting && <ArrowRight size={17} />}
        </Button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add Saving Modal Component
// ---------------------------------------------------------------------------
function AddSavingModal({ onClose, categories = [], goals = [], defaultCategoryId = '', onOpenAddCategory }: any) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOnline = useNetworkStatus();
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState(defaultCategoryId || categories[0]?.id || '');
  const [goalId, setGoalId] = useState(goals.find((g: any) => g.is_main)?.id || (goals[0]?.id || ''));
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [isGoalLinked, setIsGoalLinked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    if (!isOnline) {
      setError('Network connection lost. Please check internet and try again.');
      return;
    }

    const amt = Number(amount);
    if (!amt || amt <= 0 || isNaN(amt) || !isFinite(amt)) {
      setError('Please enter a valid savings amount greater than ₹0');
      return;
    }
    if (!categoryId) {
      setError('Please select or create a savings category');
      return;
    }

    setSubmitting(true);
    const savingData = {
      user_id: user.id,
      amount: amt,
      amount_paise: Math.round(amt * 100),
      category_id: categoryId,
      goal_id: isGoalLinked && goalId ? goalId : null,
      date: date,
      saving_date: date,
      note: note.trim() || null,
      is_goal_linked: Boolean(isGoalLinked && goalId),
    };

    const { error: err } = await supabase.from('savings').insert(savingData);
    setSubmitting(false);

    if (err) {
      console.error('Saving insert error:', err);
      setError(err.message || 'Failed to record saving transaction.');
    } else {
      await qc.invalidateQueries({ queryKey: ['savings'] });
      await qc.invalidateQueries({ queryKey: ['categories'] });
      await qc.invalidateQueries({ queryKey: ['goals'] });
      await qc.invalidateQueries({ queryKey: ['budgets'] });
      onClose();
    }
  };

  const selectedCategory = categories.find((c: any) => c.id === categoryId);
  const selectedGoal = goals.find((g: any) => g.id === goalId);

  return (
    <Modal title="Add Saving" eyebrow="Record Deposit" onClose={onClose}>
      <form className="grid gap-5 pb-2" onSubmit={submit}>
        <label className="grid gap-2 text-sm font-medium">
          <span className="text-muted-foreground font-semibold">How much did you save?</span>
          <div className="flex items-center rounded-2xl border-2 border-primary/30 bg-card px-4 py-1 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15 transition-all shadow-sm">
            <span className="font-display text-3xl sm:text-4xl text-primary font-bold select-none">₹</span>
            <input
              autoFocus
              className="h-16 w-full bg-transparent px-2 text-4xl sm:text-5xl font-bold outline-none tracking-tight text-foreground"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
            />
          </div>
        </label>

        {/* Category Selection */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">Source Category (Where from?)</span>
            {onOpenAddCategory && (
              <button
                type="button"
                onClick={onOpenAddCategory}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <Plus size={13} /> New Category
              </button>
            )}
          </div>

          {categories.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
              {categories.map((c: any) => {
                const isSelected = c.id === categoryId;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className={`touch-target flex items-center gap-2 rounded-xl p-2.5 text-xs font-semibold border transition text-left ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="text-lg shrink-0">{c.icon}</span>
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-center">
              <p className="text-xs text-muted-foreground">No categories created yet.</p>
              {onOpenAddCategory && (
                <Button type="button" variant="outline" className="mt-2 h-9 text-xs" onClick={onOpenAddCategory}>
                  <Plus size={14} /> Create a Category (e.g. Salary, YouTube)
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Goal Link Options */}
        <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
          <label className="flex items-center justify-between text-sm font-semibold cursor-pointer">
            <span className="flex items-center gap-2">
              <Target size={16} className="text-primary" />
              <span>Link this saving to a Goal (Optional)</span>
            </span>
            <input
              type="checkbox"
              checked={isGoalLinked}
              onChange={(e) => setIsGoalLinked(e.target.checked)}
              className="h-5 w-5 rounded border-input text-primary focus:ring-accent cursor-pointer"
            />
          </label>

          {isGoalLinked && (
            <div className="space-y-2 pt-1">
              {goals.length > 0 ? (
                <select
                  className="h-12 w-full rounded-xl border border-input bg-card px-3.5 text-sm outline-none focus:border-accent"
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                >
                  {goals.map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.icon} {g.name} {g.is_main ? '(Main Goal)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground">No goals created yet. You can create goals from the Goals tab.</p>
              )}
            </div>
          )}

          {isGoalLinked && goalId && selectedGoal ? (
            <p className="text-xs text-[#39715c] font-medium flex items-center gap-1.5">
              <Check size={15} /> Adds ₹{amount || '0'} to <b>{selectedCategory?.name || 'Category'}</b> AND updates <b>{selectedGoal.name}</b> progress.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Info size={15} /> Flexible saving: increases <b>{selectedCategory?.name || 'Category'}</b> and Total Saved without locking to a goal.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" type="date" value={date} onChange={(e: any) => setDate(e.target.value)} />
          <Field label="Note (optional)" value={note} onChange={(e: any) => setNote(e.target.value)} placeholder="e.g. Bonus, AdSense" />
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        <Button disabled={submitting || (categories.length === 0 && !categoryId)} type="submit" className="h-14 text-base font-bold shadow-lg mt-1 w-full">
          {submitting ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
          {submitting ? 'Saving deposit...' : 'Save Saving'}
        </Button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Set Budget Modal Component
// ---------------------------------------------------------------------------
function SetBudgetModal({ initial, onClose, categories = [], goals = [], activeMonth, activeYear }: any) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [budgetType, setBudgetType] = useState<'overall' | 'category' | 'goal'>(initial?.budget_type || 'overall');
  const [targetAmount, setTargetAmount] = useState(initial ? String(initial.target_amount) : '');
  const [categoryId, setCategoryId] = useState(initial?.category_id || categories[0]?.id || '');
  const [goalId, setGoalId] = useState(initial?.goal_id || goals[0]?.id || '');
  const [month, setMonth] = useState<number>(initial?.month || activeMonth || now.getMonth() + 1);
  const [year, setYear] = useState<number>(initial?.year || activeYear || now.getFullYear());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const targetNum = Number(targetAmount);
    if (!targetNum || targetNum <= 0 || isNaN(targetNum)) {
      setError('Please enter a valid target budget amount greater than ₹0.');
      return;
    }

    if (budgetType === 'category' && !categoryId) {
      setError('Please select a category for this budget.');
      return;
    }

    if (budgetType === 'goal' && !goalId) {
      setError('Please select a goal for this budget.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        user_id: user.id,
        month: Number(month),
        year: Number(year),
        target_amount: targetNum,
        budget_type: budgetType,
        category_id: budgetType === 'category' ? categoryId : null,
        goal_id: budgetType === 'goal' ? goalId : null,
      };

      if (initial?.id) {
        const { error: err } = await supabase.from('budgets').update(payload).eq('id', initial.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('budgets').insert(payload);
        if (err) throw err;
      }

      await qc.invalidateQueries({ queryKey: ['budgets'] });
      onClose();
    } catch (err: any) {
      console.error('Budget save error:', err);
      if (isSchemaCacheError(err)) {
        setError("⚠️ The 'budgets' table is not yet created in your Supabase database. Please execute 'supabase_schema.sql' in your Supabase SQL Editor (https://supabase.com/dashboard).");
      } else {
        setError(err.message || 'Failed to save budget.');
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal title={initial ? 'Edit Savings Budget' : 'Set Savings Budget'} eyebrow="Savings Target" onClose={onClose}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <label className="text-sm font-semibold text-muted-foreground">Budget Type</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['overall', 'Overall Monthly', Layers],
              ['category', 'Category', Wallet],
              ['goal', 'Goal', Target],
            ].map(([t, label, Icon]: any) => (
              <button
                type="button"
                key={t}
                onClick={() => setBudgetType(t)}
                className={`touch-target flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-semibold transition ${
                  budgetType === t
                    ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                <Icon size={16} />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {budgetType === 'category' && (
          <div className="grid gap-1.5 text-sm font-medium">
            <span>Select Category</span>
            {categories.length > 0 ? (
              <select
                className="h-12 w-full rounded-xl border border-input bg-card px-3.5 text-sm outline-none focus:border-accent"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">No categories available. Please create a category first.</p>
            )}
          </div>
        )}

        {budgetType === 'goal' && (
          <div className="grid gap-1.5 text-sm font-medium">
            <span>Select Goal</span>
            {goals.length > 0 ? (
              <select
                className="h-12 w-full rounded-xl border border-input bg-card px-3.5 text-sm outline-none focus:border-accent"
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
              >
                {goals.map((g: any) => (
                  <option key={g.id} value={g.id}>{g.icon} {g.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">No goals available. Please create a goal first.</p>
            )}
          </div>
        )}

        <Field
          label="Savings Target Amount (₹)"
          type="number"
          min="1"
          step="any"
          required
          autoFocus
          value={targetAmount}
          onChange={(e: any) => setTargetAmount(e.target.value)}
          placeholder="20000"
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Month</span>
            <select
              className="h-12 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-accent"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>
          </label>
          <Field
            label="Year"
            type="number"
            min="2020"
            max="2035"
            required
            value={year}
            onChange={(e: any) => setYear(Number(e.target.value))}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        <Button disabled={submitting} type="submit" className="mt-2 w-full h-12">
          {submitting ? <Loader2 className="animate-spin" size={17} /> : null}
          {initial ? (submitting ? 'Updating...' : 'Update Budget') : (submitting ? 'Saving...' : 'Set Budget')}
          {!submitting && <ArrowRight size={17} />}
        </Button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add Money Lent Modal Component
// ---------------------------------------------------------------------------
function AddMoneyLentModal({ initial, onClose }: any) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [personName, setPersonName] = useState(initial?.person_name || '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [lentDate, setLentDate] = useState(initial?.lent_date || todayStr());
  const [dueDate, setDueDate] = useState(initial?.due_date || '');
  const [note, setNote] = useState(initial?.note || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const trimmedName = personName.trim();
    if (!trimmedName) {
      setError('Please enter the person’s name (e.g. Rahul, Priya).');
      return;
    }

    const amt = Number(amount);
    if (!amt || amt <= 0 || isNaN(amt)) {
      setError('Please enter a valid amount greater than ₹0.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        user_id: user.id,
        person_name: trimmedName,
        amount: amt,
        lent_date: lentDate,
        due_date: dueDate?.trim() || null,
        note: note?.trim() || null,
        status: initial?.status || 'Pending',
      };

      if (initial?.id) {
        const { error: err } = await supabase.from('money_lent').update(payload).eq('id', initial.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('money_lent').insert(payload);
        if (err) throw err;
      }

      await qc.invalidateQueries({ queryKey: ['money_lent'] });
      onClose();
    } catch (err: any) {
      console.error('Money lent save error:', err);
      if (isSchemaCacheError(err)) {
        setError("⚠️ The 'money_lent' table is not yet created in your Supabase database. Please execute 'supabase_schema.sql' in your Supabase SQL Editor (https://supabase.com/dashboard).");
      } else {
        setError(err.message || 'Failed to record money lent.');
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal title={initial ? 'Edit Lending Record' : 'Record Money Lent'} eyebrow="Lend & Borrow" onClose={onClose}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <Field
          label="Person Name (Who did you lend to?)"
          required
          autoFocus
          value={personName}
          onChange={(e: any) => setPersonName(e.target.value)}
          placeholder="e.g. Rahul, Priya, Alex"
        />

        <Field
          label="Amount (₹)"
          type="number"
          min="1"
          step="any"
          required
          value={amount}
          onChange={(e: any) => setAmount(e.target.value)}
          placeholder="2000"
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Lent Date" type="date" required value={lentDate} onChange={(e: any) => setLentDate(e.target.value)} />
          <Field label="Due Date (optional)" type="date" value={dueDate} onChange={(e: any) => setDueDate(e.target.value)} />
        </div>

        <Field
          label="Note (optional purpose)"
          value={note}
          onChange={(e: any) => setNote(e.target.value)}
          placeholder="e.g. College expenses, Emergency"
        />

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        <Button disabled={submitting} type="submit" className="mt-2 w-full h-12">
          {submitting ? <Loader2 className="animate-spin" size={17} /> : null}
          {initial ? (submitting ? 'Updating...' : 'Update Record') : (submitting ? 'Recording...' : 'Save Lending Record')}
          {!submitting && <ArrowRight size={17} />}
        </Button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add Repayment Modal Component (Supports Partial Repayments)
// ---------------------------------------------------------------------------
function AddRepaymentModal({ record, onClose }: any) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const remaining = Number(record?.remaining || 0);
  const [amount, setAmount] = useState(String(remaining > 0 ? remaining : ''));
  const [repaymentDate, setRepaymentDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const amt = Number(amount);
    if (!amt || amt <= 0 || isNaN(amt)) {
      setError('Please enter a valid repayment amount greater than ₹0.');
      return;
    }

    if (amt > remaining + 0.01) {
      setError(`Repayment cannot exceed remaining pending balance of ${formatINR(remaining)}.`);
      return;
    }

    try {
      setSubmitting(true);
      // 1. Insert repayment record
      const { error: repErr } = await supabase.from('money_lent_repayments').insert({
        money_lent_id: record.id,
        user_id: user.id,
        amount: amt,
        repayment_date: repaymentDate,
        note: note?.trim() || null,
      });

      if (repErr) throw repErr;

      // 2. Compute updated status
      const totalRepaidAfter = Number(record.repaid_amount || 0) + amt;
      const newStatus = totalRepaidAfter >= Number(record.amount) - 0.01 ? 'Returned' : 'Partially Returned';

      await supabase.from('money_lent').update({
        status: newStatus,
        updated_at: new Date().toISOString()
      }).eq('id', record.id);

      await qc.invalidateQueries({ queryKey: ['money_lent'] });
      await qc.invalidateQueries({ queryKey: ['money_lent_repayments'] });
      onClose();
    } catch (err: any) {
      console.error('Repayment save error:', err);
      if (isSchemaCacheError(err)) {
        setError("⚠️ The 'money_lent_repayments' table is not yet created in Supabase. Please run 'supabase_schema.sql' in your Supabase SQL Editor.");
      } else {
        setError(err.message || 'Failed to record repayment.');
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Repayment from ${record?.person_name}`} eyebrow="Receive Money Back" onClose={onClose}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="rounded-2xl border border-border bg-secondary/30 p-4">
          <div className="flex justify-between text-xs font-semibold text-muted-foreground">
            <span>Total Lent: {formatINR(record?.amount)}</span>
            <span>Already Repaid: {formatINR(record?.repaid_amount)}</span>
          </div>
          <p className="mt-2 text-sm font-bold text-foreground">
            Remaining Pending: <span className="font-mono-ui text-primary text-base">{formatINR(remaining)}</span>
          </p>
        </div>

        <Field
          label="Repayment Amount (₹)"
          type="number"
          min="0.01"
          max={remaining}
          step="any"
          required
          autoFocus
          value={amount}
          onChange={(e: any) => setAmount(e.target.value)}
          placeholder={String(remaining)}
        />

        <Field
          label="Repayment Date"
          type="date"
          required
          value={repaymentDate}
          onChange={(e: any) => setRepaymentDate(e.target.value)}
        />

        <Field
          label="Note (optional)"
          value={note}
          onChange={(e: any) => setNote(e.target.value)}
          placeholder="e.g. GPay, Partial installment"
        />

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        <Button disabled={submitting} type="submit" className="mt-2 w-full h-12">
          {submitting ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}
          {submitting ? 'Recording Repayment...' : 'Confirm Repayment'}
        </Button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Repayment History Modal Component
// ---------------------------------------------------------------------------
function RepaymentHistoryModal({ record, onClose }: any) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const repaymentsQuery = useQuery({
    queryKey: ['money_lent_repayments', record.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('money_lent_repayments')
        .select('*')
        .eq('money_lent_id', record.id)
        .eq('user_id', user.id)
        .order('repayment_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  const repayments = repaymentsQuery.data || [];
  const [deleteRepConfirm, setDeleteRepConfirm] = useState<any>(null);

  return (
    <>
      <Modal title={`History: ${record.person_name}`} eyebrow="Repayment Logs" onClose={onClose}>
        <div className="space-y-4">
          <div className="flex justify-between items-center rounded-2xl bg-muted/40 p-4 text-xs font-semibold">
            <div>
              <p className="text-muted-foreground">Original Lent</p>
              <p className="font-mono-ui text-base font-bold text-foreground mt-0.5">{formatINR(record.amount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-right">Total Returned</p>
              <p className="font-mono-ui text-base font-bold text-[#39715c] mt-0.5 text-right">{formatINR(record.repaid_amount)}</p>
            </div>
          </div>

          {repaymentsQuery.isLoading ? (
            <LoadingSkeleton />
          ) : repayments.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {repayments.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3.5 text-sm">
                  <div>
                    <p className="font-semibold text-foreground font-mono-ui">+{formatINR(r.amount)}</p>
                    <p className="text-xs text-muted-foreground">{dateLabel(r.repayment_date)} {r.note ? `· ${r.note}` : ''}</p>
                  </div>
                  <button
                    onClick={() => setDeleteRepConfirm(r)}
                    className="touch-target text-muted-foreground hover:text-destructive p-1 rounded-lg"
                    title="Delete repayment"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">No repayments recorded yet for this loan.</p>
          )}

          <Button variant="outline" className="w-full h-11" onClick={onClose}>
            Close
          </Button>
        </div>
      </Modal>

      {deleteRepConfirm && (
        <ConfirmModal
          title="Delete repayment entry?"
          eyebrow="Repayment Log"
          message={`Delete repayment entry of ${formatINR(deleteRepConfirm.amount)} recorded on ${dateLabel(deleteRepConfirm.repayment_date)}?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={async () => {
            const { error } = await supabase.from('money_lent_repayments').delete().eq('id', deleteRepConfirm.id);
            if (error) throw new Error(error.message || 'Failed to delete repayment entry.');

            const remainingReps = repayments.filter((r: any) => r.id !== deleteRepConfirm.id);
            const newTotalRepaid = remainingReps.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
            let newStatus = 'Pending';
            if (newTotalRepaid >= Number(record.amount) - 0.01) {
              newStatus = 'Returned';
            } else if (newTotalRepaid > 0) {
              newStatus = 'Partially Returned';
            }

            await supabase.from('money_lent').update({ status: newStatus }).eq('id', record.id);
            await qc.invalidateQueries({ queryKey: ['money_lent'] });
            await qc.invalidateQueries({ queryKey: ['money_lent_repayments'] });
          }}
          onClose={() => setDeleteRepConfirm(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit Borrowed Money (Money I Owe) Modal
// ---------------------------------------------------------------------------
function AddBorrowedMoneyModal({ initial, onClose }: any) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [personName, setPersonName] = useState(initial?.person_name || '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [borrowedDate, setBorrowedDate] = useState(initial?.borrowed_date || todayStr());
  const [dueDate, setDueDate] = useState(initial?.due_date || '');
  const [reminderOption, setReminderOption] = useState<string>(initial?.reminder_option || 'none');
  const [reminderDate, setReminderDate] = useState(initial?.reminder_date || '');
  const [note, setNote] = useState(initial?.note || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const trimmedName = personName.trim();
    if (!trimmedName) {
      setError('Please enter the name of the person you borrowed money from.');
      return;
    }

    const amt = Number(amount);
    if (!amt || amt <= 0 || isNaN(amt)) {
      setError('Please enter a valid amount greater than ₹0.');
      return;
    }

    if (!borrowedDate) {
      setError('Please select the date you borrowed this money.');
      return;
    }

    if (reminderOption === 'custom' && !reminderDate) {
      setError('Please select a custom reminder date.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        user_id: user.id,
        person_name: trimmedName,
        amount: amt,
        borrowed_date: borrowedDate,
        due_date: dueDate?.trim() || null,
        reminder_option: reminderOption,
        reminder_date: reminderOption === 'custom' ? (reminderDate?.trim() || null) : null,
        note: note?.trim() || null,
        status: initial?.status || 'Pending',
      };

      if (initial?.id) {
        const { error: err } = await supabase.from('borrowed_money').update(payload).eq('id', initial.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('borrowed_money').insert(payload);
        if (err) throw err;
      }

      await qc.invalidateQueries({ queryKey: ['borrowed_money'] });
      onClose();
    } catch (err: any) {
      console.error('Borrowed money save error:', err);
      if (isSchemaCacheError(err)) {
        setError("⚠️ The 'borrowed_money' table is not yet created in your Supabase database. Please execute 'supabase_schema.sql' in your Supabase SQL Editor (https://supabase.com/dashboard).");
      } else {
        setError(err.message || 'Failed to record borrowed money.');
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal title={initial ? 'Edit Borrowed Money' : 'Record Money I Owe'} eyebrow="Liability & Repayments" onClose={onClose}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <Field
          label="Person Name (Who did you borrow from?)"
          required
          autoFocus
          value={personName}
          onChange={(e: any) => setPersonName(e.target.value)}
          placeholder="e.g. Rahul, Priya, Alex"
        />

        <Field
          label="Amount Borrowed (₹)"
          type="number"
          min="1"
          step="any"
          required
          value={amount}
          onChange={(e: any) => setAmount(e.target.value)}
          placeholder="5000"
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Borrowed Date" type="date" required value={borrowedDate} onChange={(e: any) => setBorrowedDate(e.target.value)} />
          <Field label="Due Date (optional)" type="date" value={dueDate} onChange={(e: any) => setDueDate(e.target.value)} />
        </div>

        {/* Reminder System Selection */}
        <div className="grid gap-1.5 text-sm font-medium">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Bell size={15} />
            <span>Repayment Reminder</span>
          </div>
          <select
            className="h-12 w-full rounded-xl border border-input bg-card px-3.5 text-sm outline-none focus:border-accent"
            value={reminderOption}
            onChange={(e) => setReminderOption(e.target.value)}
          >
            <option value="none">No reminder</option>
            <option value="1_day">1 day before due date</option>
            <option value="3_days">3 days before due date</option>
            <option value="7_days">7 days before due date</option>
            <option value="custom">Custom reminder date</option>
          </select>
        </div>

        {reminderOption === 'custom' && (
          <Field
            label="Custom Reminder Date"
            type="date"
            required
            value={reminderDate}
            onChange={(e: any) => setReminderDate(e.target.value)}
          />
        )}

        <Field
          label="Note (optional purpose)"
          value={note}
          onChange={(e: any) => setNote(e.target.value)}
          placeholder="e.g. College expenses, Emergency loan"
        />

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        <Button disabled={submitting} type="submit" className="mt-2 w-full h-12">
          {submitting ? <Loader2 className="animate-spin" size={17} /> : null}
          {initial ? (submitting ? 'Updating...' : 'Update Record') : (submitting ? 'Recording...' : 'Save Borrowed Record')}
          {!submitting && <ArrowRight size={17} />}
        </Button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Make Borrowed Repayment Modal (Supports Partial & Full Repayments)
// ---------------------------------------------------------------------------
function MakeBorrowedRepaymentModal({ record, onClose }: any) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const remaining = Number(record?.remaining || 0);
  const [amount, setAmount] = useState(String(remaining > 0 ? remaining : ''));
  const [repaymentDate, setRepaymentDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const amt = Number(amount);
    if (!amt || amt <= 0 || isNaN(amt)) {
      setError('Please enter a valid repayment amount greater than ₹0.');
      return;
    }

    if (amt > remaining + 0.01) {
      setError(`Repayment cannot exceed the remaining pending balance of ${formatINR(remaining)}.`);
      return;
    }

    try {
      setSubmitting(true);
      // 1. Insert repayment record
      const { error: repErr } = await supabase.from('borrowed_money_repayments').insert({
        borrowed_money_id: record.id,
        user_id: user.id,
        amount: amt,
        repayment_date: repaymentDate,
        note: note?.trim() || null,
      });

      if (repErr) throw repErr;

      // 2. Compute updated status
      const totalRepaidAfter = Number(record.repaid_amount || 0) + amt;
      const newStatus = totalRepaidAfter >= Number(record.amount) - 0.01 ? 'Paid' : 'Partially Paid';

      await supabase.from('borrowed_money').update({
        status: newStatus,
        updated_at: new Date().toISOString()
      }).eq('id', record.id);

      await qc.invalidateQueries({ queryKey: ['borrowed_money'] });
      await qc.invalidateQueries({ queryKey: ['borrowed_money_repayments'] });
      onClose();
    } catch (err: any) {
      console.error('Borrowed repayment save error:', err);
      if (isSchemaCacheError(err)) {
        setError("⚠️ The 'borrowed_money_repayments' table is not yet created in Supabase. Please execute 'supabase_schema.sql' in your Supabase SQL Editor.");
      } else {
        setError(err.message || 'Failed to record repayment.');
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Repay to ${record?.person_name}`} eyebrow="Make Repayment" onClose={onClose}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="rounded-2xl border border-border bg-secondary/30 p-4">
          <div className="flex justify-between text-xs font-semibold text-muted-foreground">
            <span>Original Borrowed: {formatINR(record?.amount)}</span>
            <span>Already Repaid: {formatINR(record?.repaid_amount)}</span>
          </div>
          <p className="mt-2 text-sm font-bold text-foreground">
            Remaining to Repay: <span className="font-mono-ui text-primary text-base">{formatINR(remaining)}</span>
          </p>
        </div>

        <Field
          label="Repayment Amount (₹)"
          type="number"
          min="0.01"
          max={remaining}
          step="any"
          required
          autoFocus
          value={amount}
          onChange={(e: any) => setAmount(e.target.value)}
          placeholder={String(remaining)}
        />

        <Field
          label="Repayment Date"
          type="date"
          required
          value={repaymentDate}
          onChange={(e: any) => setRepaymentDate(e.target.value)}
        />

        <Field
          label="Note (optional)"
          value={note}
          onChange={(e: any) => setNote(e.target.value)}
          placeholder="e.g. Bank transfer, Cash, Partial settlement"
        />

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        <Button disabled={submitting} type="submit" className="mt-2 w-full h-12">
          {submitting ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}
          {submitting ? 'Recording Repayment...' : 'Confirm Repayment'}
        </Button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Borrowed Money Person Details & Repayment History Modal
// ---------------------------------------------------------------------------
function BorrowedRepaymentHistoryModal({ record, onClose, onMakeRepayment }: any) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const repaymentsQuery = useQuery({
    queryKey: ['borrowed_money_repayments', record.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('borrowed_money_repayments')
        .select('*')
        .eq('borrowed_money_id', record.id)
        .eq('user_id', user.id)
        .order('repayment_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  const repayments = repaymentsQuery.data || [];
  const countdown = formatDueCountdown(record.due_date);
  const [deleteRepConfirm, setDeleteRepConfirm] = useState<any>(null);

  return (
    <>
      <Modal title={record.person_name} eyebrow="Borrowed Details & History" onClose={onClose}>
        <div className="space-y-4">
          {/* Financial Summary */}
          <div className="grid grid-cols-3 gap-2.5 rounded-2xl bg-muted/40 p-4 text-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Original</p>
              <p className="mt-1 font-mono-ui text-base font-bold text-foreground">{formatINR(record.amount)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Repaid</p>
              <p className="mt-1 font-mono-ui text-base font-bold text-[#39715c]">{formatINR(record.repaid_amount)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Remaining</p>
              <p className={`mt-1 font-mono-ui text-base font-bold ${record.remaining > 0 ? 'text-[#b86e48]' : 'text-[#39715c]'}`}>
                {formatINR(record.remaining)}
              </p>
            </div>
          </div>

          {/* Details List */}
          <div className="space-y-2 rounded-xl border border-border bg-card p-3.5 text-xs">
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Borrowed Date</span>
              <span className="font-semibold">{dateLabel(record.borrowed_date)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Due Date</span>
              <span className="font-semibold flex items-center gap-1.5">
                {record.due_date ? dateLabel(record.due_date) : 'No due date'}
                {countdown && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    countdown.isOverdue ? 'bg-destructive/15 text-destructive' : countdown.isToday ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-secondary text-secondary-foreground'
                  }`}>
                    {countdown.text}
                  </span>
                )}
              </span>
            </div>
            {record.reminder_option && record.reminder_option !== 'none' && (
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Reminder</span>
                <span className="font-semibold text-primary flex items-center gap-1">
                  <Bell size={12} />
                  {record.reminder_option === '1_day' && '1 day before due date'}
                  {record.reminder_option === '3_days' && '3 days before due date'}
                  {record.reminder_option === '7_days' && '7 days before due date'}
                  {record.reminder_option === 'custom' && `Custom on ${dateLabel(record.reminder_date)}`}
                </span>
              </div>
            )}
            {record.note && (
              <div className="py-1">
                <span className="text-muted-foreground block mb-0.5">Notes:</span>
                <p className="font-medium text-foreground bg-muted/40 p-2 rounded-lg italic">"{record.note}"</p>
              </div>
            )}
          </div>

          {/* Repayment History Log */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Repayment History ({repayments.length})
            </h4>

            {repaymentsQuery.isLoading ? (
              <LoadingSkeleton />
            ) : repayments.length > 0 ? (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {repayments.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
                    <div>
                      <p className="font-semibold text-[#39715c] font-mono-ui">+{formatINR(r.amount)} repaid</p>
                      <p className="text-xs text-muted-foreground">{dateLabel(r.repayment_date)} {r.note ? `· ${r.note}` : ''}</p>
                    </div>
                    <button
                      onClick={() => setDeleteRepConfirm(r)}
                      className="touch-target text-muted-foreground hover:text-destructive p-1 rounded-lg"
                      title="Delete repayment entry"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4 bg-muted/20 rounded-xl">
                No repayments made yet.
              </p>
            )}
          </div>

          {/* Bottom Actions */}
          <div className="flex gap-2 pt-2">
            {record.remaining > 0 && onMakeRepayment && (
              <Button
                variant="primary"
                className="flex-1 h-11 text-xs font-bold"
                onClick={() => {
                  onClose();
                  onMakeRepayment(record);
                }}
              >
                <Plus size={15} /> Make Repayment
              </Button>
            )}
            <Button variant="outline" className="flex-1 h-11 text-xs font-semibold" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {deleteRepConfirm && (
        <ConfirmModal
          title="Delete repayment entry?"
          eyebrow="Repayment Log"
          message={`Delete repayment entry of ${formatINR(deleteRepConfirm.amount)} recorded on ${dateLabel(deleteRepConfirm.repayment_date)}?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={async () => {
            const { error } = await supabase.from('borrowed_money_repayments').delete().eq('id', deleteRepConfirm.id);
            if (error) throw new Error(error.message || 'Failed to delete repayment entry.');

            const remainingReps = repayments.filter((r: any) => r.id !== deleteRepConfirm.id);
            const newTotalRepaid = remainingReps.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
            let newStatus = 'Pending';
            if (newTotalRepaid >= Number(record.amount) - 0.01) {
              newStatus = 'Paid';
            } else if (newTotalRepaid > 0) {
              newStatus = 'Partially Paid';
            }

            await supabase.from('borrowed_money').update({ status: newStatus }).eq('id', record.id);
            await qc.invalidateQueries({ queryKey: ['borrowed_money'] });
            await qc.invalidateQueries({ queryKey: ['borrowed_money_repayments'] });
          }}
          onClose={() => setDeleteRepConfirm(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Dashboard View (Personal Savings + Goals + Budgets + Money Lent + Money I Owe)
// ---------------------------------------------------------------------------
function Dashboard() {
  const { user } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showLendModal, setShowLendModal] = useState(false);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [selectedSaving, setSelectedSaving] = useState<any>(null);
  const [deleteSavingConfirm, setDeleteSavingConfirm] = useState<any>(null);

  // 1. Fetch Categories
  const categoriesQuery = useQuery({
    queryKey: ['categories', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // 2. Fetch Goals
  const goalsQuery = useQuery({
    queryKey: ['goals', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*').eq('user_id', user.id).order('is_main', { ascending: false }).order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // 3. Fetch Savings Transactions
  const savingsQuery = useQuery({
    queryKey: ['savings', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('savings')
        .select('*, categories(*), goals(*)')
        .eq('user_id', user.id)
        .order('saving_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // 4. Fetch Budgets
  const budgetsQuery = useQuery({
    queryKey: ['budgets', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('*, categories(*), goals(*)')
        .eq('user_id', user.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  // 5. Fetch Money Lent & Repayments
  const moneyLentQuery = useQuery({
    queryKey: ['money_lent', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('money_lent')
        .select('*')
        .eq('user_id', user.id)
        .order('lent_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  const repaymentsQuery = useQuery({
    queryKey: ['money_lent_repayments', 'all', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('money_lent_repayments')
        .select('*')
        .eq('user_id', user.id);
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  // 6. Fetch Borrowed Money & Borrowed Repayments
  const borrowedQuery = useQuery({
    queryKey: ['borrowed_money', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('borrowed_money')
        .select('*')
        .eq('user_id', user.id)
        .order('borrowed_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  const borrowedRepaymentsQuery = useQuery({
    queryKey: ['borrowed_money_repayments', 'all', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('borrowed_money_repayments')
        .select('*')
        .eq('user_id', user.id);
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  const qc = useQueryClient();
  const isLoading = categoriesQuery.isLoading || goalsQuery.isLoading || savingsQuery.isLoading;

  const categories = categoriesQuery.data || [];
  const goals = goalsQuery.data || [];
  const savings = savingsQuery.data || [];
  const budgets = budgetsQuery.data || [];
  const moneyLent = moneyLentQuery.data || [];
  const allRepayments = repaymentsQuery.data || [];
  const borrowedMoney = borrowedQuery.data || [];
  const allBorrowedRepayments = borrowedRepaymentsQuery.data || [];

  // Goal saved amount calculation
  const goalsWithCalculatedAmounts = useMemo(() => {
    return goals.map((g: any) => {
      const targetAmt = Number(g.target_amount || 0);
      const startingAmt = Number(g.starting_amount || 0);
      const linkedDeposits = savings
        .filter((s: any) => s.goal_id === g.id && s.is_goal_linked !== false)
        .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
      return {
        ...g,
        target_amount: targetAmt,
        starting_amount: startingAmt,
        saved_amount: startingAmt + linkedDeposits,
      };
    });
  }, [goals, savings]);

  const activeMainGoal = goalsWithCalculatedAmounts.find((g: any) => g.is_main) || goalsWithCalculatedAmounts[0] || null;

  // Category totals
  const categoriesWithTotals = useMemo(() => {
    return categories.map((c: any) => {
      const catSavings = savings.filter((s: any) => s.category_id === c.id);
      const total = catSavings.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
      return {
        ...c,
        total_amount: total,
        entry_count: catSavings.length,
      };
    });
  }, [categories, savings]);

  // Current Month & Today Totals
  const today = todayStr();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthPrefix = today.slice(0, 7);

  const todayTotal = savings.filter((s: any) => (s.saving_date || s.date) === today).reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
  const monthTotal = savings.filter((s: any) => (s.saving_date || s.date || '').startsWith(currentMonthPrefix)).reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
  const totalSaved = savings.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);

  // Current Month Overall Budget
  const currentOverallBudget = useMemo(() => {
    return budgets.find((b: any) => b.budget_type === 'overall' && Number(b.year) === currentYear && Number(b.month) === currentMonth);
  }, [budgets, currentYear, currentMonth]);

  // Money Lent Calculations
  const moneyLentWithRepayments = useMemo(() => {
    return moneyLent.map((l: any) => {
      const reps = allRepayments.filter((r: any) => r.money_lent_id === l.id);
      const repaid = reps.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      const totalAmt = Number(l.amount || 0);
      const remaining = Math.max(0, totalAmt - repaid);
      const isOverdue = remaining > 0 && Boolean(l.due_date) && l.due_date < today;

      let calculatedStatus = l.status;
      if (repaid >= totalAmt - 0.01) {
        calculatedStatus = 'Returned';
      } else if (repaid > 0) {
        calculatedStatus = isOverdue ? 'Overdue' : 'Partially Returned';
      } else if (isOverdue) {
        calculatedStatus = 'Overdue';
      } else {
        calculatedStatus = 'Pending';
      }

      return {
        ...l,
        repaid_amount: repaid,
        remaining,
        computed_status: calculatedStatus,
        is_overdue: isOverdue,
      };
    });
  }, [moneyLent, allRepayments, today]);

  const totalLent = moneyLentWithRepayments.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
  const totalLentPending = moneyLentWithRepayments.reduce((sum: number, l: any) => sum + l.remaining, 0);

  // Borrowed Money Calculations (Money I Owe)
  const borrowedWithRepayments = useMemo(() => {
    return borrowedMoney.map((b: any) => {
      const reps = allBorrowedRepayments.filter((r: any) => r.borrowed_money_id === b.id);
      const repaid = reps.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      const totalAmt = Number(b.amount || 0);
      const remaining = Math.max(0, totalAmt - repaid);
      const isOverdue = remaining > 0 && Boolean(b.due_date) && b.due_date < today;

      let calculatedStatus = b.status;
      if (remaining <= 0.01) {
        calculatedStatus = 'Paid';
      } else if (repaid > 0) {
        calculatedStatus = isOverdue ? 'Overdue' : 'Partially Paid';
      } else if (isOverdue) {
        calculatedStatus = 'Overdue';
      } else {
        calculatedStatus = 'Pending';
      }

      const dueInfo = formatDueCountdown(b.due_date);

      return {
        ...b,
        repaid_amount: repaid,
        remaining,
        computed_status: calculatedStatus,
        is_overdue: isOverdue,
        due_info: dueInfo,
      };
    });
  }, [borrowedMoney, allBorrowedRepayments, today]);

  const totalBorrowedRemaining = useMemo(() => {
    return borrowedWithRepayments
      .filter((b: any) => b.remaining > 0)
      .reduce((sum: number, b: any) => sum + b.remaining, 0);
  }, [borrowedWithRepayments]);

  const borrowedPeopleCount = useMemo(() => {
    const people = new Set(
      borrowedWithRepayments
        .filter((b: any) => b.remaining > 0)
        .map((b: any) => (b.person_name || '').trim().toLowerCase())
    );
    return people.size;
  }, [borrowedWithRepayments]);

  const borrowedOverdueTotal = useMemo(() => {
    return borrowedWithRepayments
      .filter((b: any) => b.is_overdue)
      .reduce((sum: number, b: any) => sum + b.remaining, 0);
  }, [borrowedWithRepayments]);

  // Combined Due Reminders (Money Lent + Money I Owe)
  const combinedDueReminders = useMemo(() => {
    const list: any[] = [];
    // Money Lent due soon / overdue
    moneyLentWithRepayments.forEach((l: any) => {
      if (l.remaining > 0 && l.due_date) {
        const info = formatDueCountdown(l.due_date);
        if (info && (info.isOverdue || info.isToday || (info.daysDiff > 0 && info.daysDiff <= 3))) {
          list.push({
            id: `lent-${l.id}`,
            type: 'lent',
            person: l.person_name,
            amount: l.remaining,
            due_date: l.due_date,
            is_overdue: info.isOverdue,
            is_today: info.isToday,
            countdownText: info.text,
            link: '/money-lent',
          });
        }
      }
    });
    // Money I Owe due soon / overdue
    borrowedWithRepayments.forEach((b: any) => {
      if (b.remaining > 0 && b.due_date) {
        const info = formatDueCountdown(b.due_date);
        if (info && (info.isOverdue || info.isToday || (info.daysDiff > 0 && info.daysDiff <= 7))) {
          list.push({
            id: `borrowed-${b.id}`,
            type: 'borrowed',
            person: b.person_name,
            amount: b.remaining,
            due_date: b.due_date,
            is_overdue: info.isOverdue,
            is_today: info.isToday,
            countdownText: info.text,
            link: '/borrowed',
          });
        }
      }
    });

    return list.sort((a, b) => {
      if (a.is_overdue && !b.is_overdue) return -1;
      if (!a.is_overdue && b.is_overdue) return 1;
      return (a.due_date || '').localeCompare(b.due_date || '');
    });
  }, [moneyLentWithRepayments, borrowedWithRepayments]);

  // Real Saving Streak calculation
  const streak = useMemo(() => {
    const dates = Array.from(new Set(savings.map((s: any) => (s.saving_date || s.date || '').slice(0, 10)).filter(Boolean))).sort().reverse();
    if (dates.length === 0) return 0;
    const dateSet = new Set(dates);
    let current = 0;
    let check = new Date();
    const todayS = check.toISOString().slice(0, 10);
    check.setDate(check.getDate() - 1);
    const yesterdayS = check.toISOString().slice(0, 10);

    let startStr = dateSet.has(todayS) ? todayS : dateSet.has(yesterdayS) ? yesterdayS : '';
    if (startStr) {
      let runner = new Date(startStr);
      while (dateSet.has(runner.toISOString().slice(0, 10))) {
        current++;
        runner.setDate(runner.getDate() - 1);
      }
    }
    return current;
  }, [savings]);

  const deleteSavingFromDetail = (s: any) => {
    setDeleteSavingConfirm(s);
  };

  const saveCategoryFromDashboard = async (form: any) => {
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      icon: form.icon || '💰',
    };
    const { error } = await supabase.from('categories').insert(payload);
    if (error) throw new Error(error.message || 'Failed to create category.');
    await qc.invalidateQueries({ queryKey: ['categories'] });
    setShowCategoryModal(false);
  };

  const saveGoalFromDashboard = async (form: any) => {
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      icon: form.icon || '🎯',
      target_amount: Number(form.target_amount),
      starting_amount: Number(form.starting_amount || 0),
      target_date: form.target_date?.trim() || null,
      description: form.description?.trim() || null,
      is_main: goals.length === 0 || Boolean(form.is_main),
    };
    if (form.is_main) {
      await supabase.from('goals').update({ is_main: false }).eq('user_id', user.id);
    }
    const { error } = await supabase.from('goals').insert(payload);
    if (error) throw new Error(error.message || 'Failed to create goal.');
    await qc.invalidateQueries({ queryKey: ['goals'] });
    setShowGoalModal(false);
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const mainGoalSaved = activeMainGoal?.saved_amount || 0;
  const mainGoalTarget = activeMainGoal?.target_amount || 0;
  const mainGoalPercentage = pct(mainGoalSaved, mainGoalTarget);
  const mainGoalRemaining = Math.max(0, mainGoalTarget - mainGoalSaved);

  const budgetTarget = Number(currentOverallBudget?.target_amount || 0);
  const budgetProgress = budgetTarget > 0 ? Math.min(100, Math.round((monthTotal / budgetTarget) * 100)) : 0;

  return (
    <>
      {/* Greeting Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight">
            {getGreeting()}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground font-medium">
            {user.user_metadata?.full_name || user.email?.split('@')[0]}
          </p>
        </div>
      </div>

      {/* Due Repayment Reminders Banner (Combined Lent & Borrowed) */}
      {combinedDueReminders.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" size={18} />
            <div className="flex-1">
              <p className="font-semibold">Repayment Due Reminders</p>
              <div className="mt-1 space-y-1 text-xs">
                {combinedDueReminders.slice(0, 3).map((item: any) => (
                  <p key={item.id}>
                    {item.type === 'borrowed' ? (
                      <span>
                        <b>{formatINR(item.amount)}</b> to <b>{item.person}</b> {item.is_today ? 'is due today' : item.is_overdue ? `is overdue (${item.countdownText})` : `is ${item.countdownText}`}.
                      </span>
                    ) : (
                      <span>
                        <b>{formatINR(item.amount)}</b> from <b>{item.person}</b> {item.is_today ? 'is due today' : item.is_overdue ? `is overdue (${item.countdownText})` : `is ${item.countdownText}`}.
                      </span>
                    )}
                  </p>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1 shrink-0 text-right">
              {combinedDueReminders.some((r: any) => r.type === 'borrowed') && (
                <Link href="/borrowed" className="text-xs font-bold text-primary underline">
                  Money I Owe
                </Link>
              )}
              {combinedDueReminders.some((r: any) => r.type === 'lent') && (
                <Link href="/money-lent" className="text-xs font-bold text-primary underline">
                  Money Lent
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Bar */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-3 shadow-xs">
        <p className="px-1 text-[10px] font-mono-ui uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Quick Actions
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:-translate-y-0.5 transition-all shadow-xs"
          >
            <Plus size={15} /> Add Saving
          </button>
          <button
            onClick={() => setShowGoalModal(true)}
            className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-all"
          >
            <Target size={15} className="text-[#39715c]" /> Create Goal
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-all"
          >
            <Wallet size={15} className="text-accent" /> Add Category
          </button>
          <button
            onClick={() => setShowBudgetModal(true)}
            className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-all"
          >
            <PiggyBank size={15} className="text-primary" /> Set Budget
          </button>
          <button
            onClick={() => setShowLendModal(true)}
            className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-all"
          >
            <HandCoins size={15} className="text-[#b86e48]" /> Lend Money
          </button>
          <button
            onClick={() => setShowBorrowModal(true)}
            className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-all"
          >
            <Receipt size={15} className="text-[#39715c]" /> + Add Money I Owe
          </button>
          <button
            onClick={() => setShowPdfModal(true)}
            className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-all"
          >
            <FileText size={15} className="text-primary" /> Export Monthly Report
          </button>
        </div>
      </div>

      {/* Core Overview Grid */}
      <div className="grid gap-6">
        {/* Main Goal Card */}
        {activeMainGoal ? (
          <div className="rounded-[1.8rem] bg-primary p-6 text-primary-foreground sm:p-8 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary-foreground/60 font-semibold">MAIN GOAL</p>
                <h2 className="mt-1 font-display text-3xl sm:text-4xl tracking-tight">
                  {activeMainGoal.icon} {activeMainGoal.name}
                </h2>
              </div>
              <span className="rounded-full bg-accent px-3 py-1 font-mono-ui text-xs font-bold text-primary">
                {mainGoalPercentage}%
              </span>
            </div>

            <div className="mt-8 flex items-baseline justify-between">
              <div className="min-w-0">
                <p className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-balance">
                  {formatINR(mainGoalSaved)}
                </p>
              </div>
              <p className="text-sm font-semibold text-primary-foreground/60 whitespace-nowrap">
                of {formatINR(mainGoalTarget)}
              </p>
            </div>

            {/* Visual Progress Bar */}
            <div className="mt-4 h-3.5 overflow-hidden rounded-full bg-primary-foreground/15">
              <div
                className="h-full rounded-full bg-accent transition-all duration-700 shadow-sm"
                style={{ width: `${mainGoalPercentage}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-primary-foreground/65 font-medium">
              <span>{mainGoalPercentage}% completed</span>
              <span>{formatINR(mainGoalRemaining)} remaining</span>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Create your Main Savings Goal"
            body="Set your primary target destination (e.g. Laptop, Emergency Fund) to track real-time progress."
            action={
              <Button onClick={() => setShowGoalModal(true)}>
                <Plus size={16} /> Create a Goal
              </Button>
            }
          />
        )}

        {/* 5 Summary Cards: Today, This Month, Total Saved, Money Lent, MONEY I OWE */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today</p>
            <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-foreground">{formatINR(todayTotal)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">This Month</p>
            <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-[#39715c]">{formatINR(monthTotal)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Saved</p>
            <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-foreground">{formatINR(totalSaved)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
            <div className="flex justify-between items-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Money Lent</p>
              <Link href="/money-lent" className="text-[11px] font-semibold text-primary">View</Link>
            </div>
            <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-[#b86e48]">{formatINR(totalLentPending)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{formatINR(totalLent)} total lent</p>
          </div>
          <Link
            href="/borrowed"
            className={`rounded-2xl border p-4 sm:p-5 shadow-xs flex flex-col justify-between transition hover:shadow-md col-span-2 sm:col-span-1 ${
              borrowedOverdueTotal > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card hover:border-border/80'
            }`}
          >
            <div>
              <div className="flex justify-between items-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Money I Owe</p>
                <span className="text-[11px] font-semibold text-primary">View</span>
              </div>
              <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-[#b86e48]">{formatINR(totalBorrowedRemaining)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{borrowedPeopleCount} {borrowedPeopleCount === 1 ? 'person' : 'people'}</p>
            </div>
            {borrowedOverdueTotal > 0 && (
              <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-destructive">
                <AlertTriangle size={13} /> ⚠ {formatINR(borrowedOverdueTotal)} overdue
              </div>
            )}
          </Link>
        </div>

        {/* Budget & Streak Cards Row */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Budget Widget Card */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">
                  <PiggyBank size={18} />
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold">Monthly Budget</h3>
                  <p className="text-xs text-muted-foreground">{MONTH_NAMES[currentMonth - 1]} {currentYear}</p>
                </div>
              </div>
              <Link href="/budget" className="text-xs font-semibold text-primary hover:underline">
                Details
              </Link>
            </div>

            {budgetTarget > 0 ? (
              <div className="mt-4">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold font-mono-ui text-foreground">{formatINR(monthTotal)}</span>
                  <span className="text-xs text-muted-foreground">Target: {formatINR(budgetTarget)}</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${monthTotal >= budgetTarget ? 'bg-[#39715c]' : 'bg-[#c6784e]'}`}
                    style={{ width: `${Math.min(100, budgetProgress)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[11px] font-medium text-muted-foreground">
                  <span>{budgetProgress}% saved</span>
                  <span>
                    {monthTotal >= budgetTarget
                      ? `Budget reached (${formatINR(monthTotal - budgetTarget)} over)`
                      : `${formatINR(budgetTarget - monthTotal)} remaining`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-xs text-muted-foreground">
                <p>No savings budget set for this month.</p>
                <button onClick={() => setShowBudgetModal(true)} className="mt-2 text-primary font-semibold hover:underline">
                  + Set {MONTH_NAMES[currentMonth - 1]} Budget
                </button>
              </div>
            )}
          </div>

          {/* Streak Card */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f7dfc9] text-[#a35e3e] text-2xl">
                🔥
              </span>
              <div>
                <p className="font-display text-2xl font-bold">{streak} {streak === 1 ? 'day' : 'days'} streak</p>
                <p className="text-xs text-muted-foreground">Consistent daily savings record</p>
              </div>
            </div>
            <span className="font-mono-ui text-xs font-semibold text-[#39715c] bg-secondary px-3 py-1.5 rounded-full">
              Active
            </span>
          </div>
        </div>

        {/* Recent Savings & Money Sources */}
        <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
          {/* Recent Savings */}
          <section>
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="font-display text-2xl">Recent Savings</h2>
              <Link href="/savings" className="touch-target text-xs font-semibold text-muted-foreground hover:text-foreground">
                See all <ArrowRight className="ml-0.5 inline" size={13} />
              </Link>
            </div>
            {savings.length ? (
              <div className="grid gap-2.5">
                {savings.slice(0, 5).map((s: any) => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSaving(s)}
                    className="touch-target flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition hover:bg-muted/50 cursor-pointer active:scale-[0.99]"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-lg">
                      {s.categories?.icon || '💰'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{s.categories?.name || 'Saving'}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {s.is_goal_linked && s.goals?.name ? `For ${s.goals.name}` : s.note || 'Flexible deposit'} · {shortDate(s.saving_date || s.date)}
                      </p>
                    </div>
                    <p className="font-mono-ui text-sm sm:text-base font-bold text-[#39715c]">+{formatINR(s.amount)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No savings recorded yet"
                body="Record your first deposit to start tracking real-time savings."
                action={
                  <Button onClick={() => setShowAddModal(true)}>
                    <Plus size={16} /> Add first saving
                  </Button>
                }
              />
            )}
          </section>

          {/* Money Sources (Categories) */}
          <section>
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="font-display text-2xl">Savings Categories</h2>
              <Link href="/categories" className="touch-target text-xs font-semibold text-muted-foreground hover:text-foreground">Manage</Link>
            </div>
            {categoriesWithTotals.length ? (
              <div className="rounded-2xl border border-border bg-card p-2 space-y-1">
                {categoriesWithTotals.slice(0, 5).map((c: any) => (
                  <div className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted/60" key={c.id}>
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-base">{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.entry_count} deposits</p>
                    </div>
                    <p className="font-mono-ui text-sm font-bold">{formatINR(c.total_amount)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
                <p className="text-sm font-semibold text-foreground">No categories yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Add your money sources (e.g. Salary, YouTube) to start tracking.</p>
                <Button onClick={() => setShowCategoryModal(true)} className="mt-3.5 h-9 text-xs">
                  <Plus size={14} /> Add Category
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>

      {showAddModal && (
        <AddSavingModal
          onClose={() => setShowAddModal(false)}
          categories={categories}
          goals={goals}
          onOpenAddCategory={() => {
            setShowAddModal(false);
            setShowCategoryModal(true);
          }}
        />
      )}

      {showCategoryModal && (
        <CategoryModal
          onClose={() => setShowCategoryModal(false)}
          onSubmit={saveCategoryFromDashboard}
        />
      )}

      {showGoalModal && (
        <GoalModal
          onClose={() => setShowGoalModal(false)}
          onSubmit={saveGoalFromDashboard}
        />
      )}

      {showBudgetModal && (
        <SetBudgetModal
          onClose={() => setShowBudgetModal(false)}
          categories={categories}
          goals={goals}
          activeMonth={currentMonth}
          activeYear={currentYear}
        />
      )}

      {showLendModal && (
        <AddMoneyLentModal
          onClose={() => setShowLendModal(false)}
        />
      )}

      {showBorrowModal && (
        <AddBorrowedMoneyModal
          onClose={() => setShowBorrowModal(false)}
        />
      )}

      {selectedSaving && (
        <TransactionDetailModal
          saving={selectedSaving}
          onClose={() => setSelectedSaving(null)}
          onDelete={deleteSavingFromDetail}
        />
      )}

      {showPdfModal && (
        <ExportPdfReportModal onClose={() => setShowPdfModal(false)} />
      )}

      {deleteSavingConfirm && (
        <ConfirmModal
          title="Delete saving entry?"
          eyebrow="Delete Deposit"
          message={`Delete saving entry of ${formatINR(deleteSavingConfirm.amount)}? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={async () => {
            const { error } = await supabase.from('savings').delete().eq('id', deleteSavingConfirm.id);
            if (error) throw new Error(error.message || 'Failed to delete saving.');
            await qc.invalidateQueries();
            setSelectedSaving(null);
          }}
          onClose={() => setDeleteSavingConfirm(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 1. Advanced Analytics Page (Strict Prompt Section #1)
// ---------------------------------------------------------------------------
function AnalyticsPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<'7d' | '30d' | '3m' | '6m' | '1y' | 'all'>('30d');
  const [showPdfModal, setShowPdfModal] = useState(false);

  const savingsQuery = useQuery({
    queryKey: ['savings', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('savings')
        .select('*, categories(*), goals(*)')
        .eq('user_id', user.id)
        .order('saving_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
  });

  const goalsQuery = useQuery({
    queryKey: ['goals', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
  });

  const savings = savingsQuery.data || [];
  const categories = categoriesQuery.data || [];
  const goals = goalsQuery.data || [];

  const today = todayStr();
  const now = new Date();
  const currentYear = now.getFullYear();

  // A. Total Saved Breakdowns (Today, This Week, This Month, This Year, All Time)
  const totals = useMemo(() => {
    const todaySavings = savings.filter(s => s.saving_date === today);
    const todayTotal = todaySavings.reduce((sum, s) => sum + Number(s.amount || 0), 0);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekTotal = savings.filter(s => (s.saving_date || '') >= weekStartStr).reduce((sum, s) => sum + Number(s.amount || 0), 0);

    const currentMonthPrefix = today.slice(0, 7);
    const monthTotal = savings.filter(s => (s.saving_date || '').startsWith(currentMonthPrefix)).reduce((sum, s) => sum + Number(s.amount || 0), 0);

    const currentYearPrefix = String(currentYear);
    const yearTotal = savings.filter(s => (s.saving_date || '').startsWith(currentYearPrefix)).reduce((sum, s) => sum + Number(s.amount || 0), 0);

    const allTimeTotal = savings.reduce((sum, s) => sum + Number(s.amount || 0), 0);

    return { todayTotal, weekTotal, monthTotal, yearTotal, allTimeTotal };
  }, [savings, today, now, currentYear]);

  // Filter savings for interactive chart by selected range
  const filteredSavings = useMemo(() => {
    let days = 30;
    if (range === '7d') days = 7;
    if (range === '30d') days = 30;
    if (range === '3m') days = 90;
    if (range === '6m') days = 180;
    if (range === '1y') days = 365;
    if (range === 'all') days = 99999;

    const start = new Date();
    start.setDate(start.getDate() - days);
    const startStr = start.toISOString().slice(0, 10);

    return savings.filter((s: any) => (s.saving_date || '') >= startStr);
  }, [savings, range]);

  const totalRangeSaved = filteredSavings.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
  const avgSavingDeposit = filteredSavings.length > 0 ? Math.round(totalRangeSaved / filteredSavings.length) : 0;

  // B. Savings Trend Line / Area Chart Data
  const trendChartData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSavings.forEach((s: any) => {
      const d = (s.saving_date || '').slice(0, 10);
      if (d) map[d] = (map[d] || 0) + Number(s.amount || 0);
    });

    const sortedEntries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    let runningTotal = 0;
    return sortedEntries.map(([date, amount]) => {
      runningTotal += amount;
      return {
        date,
        displayDate: shortDate(date),
        deposit: amount,
        cumulative: runningTotal,
      };
    });
  }, [filteredSavings]);

  // C. Category Analytics Breakdown
  const categoryAnalytics = useMemo(() => {
    const map: Record<string, { id: string; name: string; icon: string; total: number; count: number }> = {};
    savings.forEach((s: any) => {
      const catId = s.category_id || 'other';
      const catName = s.categories?.name || 'Other';
      const catIcon = s.categories?.icon || '💰';
      if (!map[catId]) {
        map[catId] = { id: catId, name: catName, icon: catIcon, total: 0, count: 0 };
      }
      map[catId].total += Number(s.amount || 0);
      map[catId].count += 1;
    });

    const totalAll = Object.values(map).reduce((sum, c) => sum + c.total, 0);
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .map(c => ({
        ...c,
        percentage: totalAll > 0 ? Math.round((c.total / totalAll) * 100) : 0,
      }));
  }, [savings]);

  // D. Goal Analytics Breakdown
  const goalAnalytics = useMemo(() => {
    return goals.map((g: any) => {
      const targetAmt = Number(g.target_amount || 0);
      const startingAmt = Number(g.starting_amount || 0);
      const linked = savings
        .filter((s: any) => s.goal_id === g.id && s.is_goal_linked !== false)
        .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
      const savedAmt = startingAmt + linked;
      const remainingAmt = Math.max(0, targetAmt - savedAmt);
      const progress = pct(savedAmt, targetAmt);
      return {
        ...g,
        target_amount: targetAmt,
        saved_amount: savedAmt,
        remaining_amount: remainingAmt,
        progress,
      };
    });
  }, [goals, savings]);

  // E. Monthly Savings Trend & G. Best Saving Month & H. Average
  const monthlySavings = useMemo(() => {
    const map: Record<string, number> = {};
    savings.forEach((s: any) => {
      const monthPrefix = (s.saving_date || '').slice(0, 7);
      if (monthPrefix) {
        map[monthPrefix] = (map[monthPrefix] || 0) + Number(s.amount || 0);
      }
    });

    const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    let bestMonth = { monthStr: '', amount: 0 };
    sorted.forEach(([m, amt]) => {
      if (amt > bestMonth.amount) {
        bestMonth = { monthStr: m, amount: amt };
      }
    });

    const avgMonthly = sorted.length > 0 ? Math.round(totals.allTimeTotal / sorted.length) : 0;

    const chartData = sorted.map(([m, amt]) => {
      const [year, month] = m.split('-').map(Number);
      return {
        key: m,
        name: `${MONTH_NAMES[month - 1]?.slice(0, 3)} '${String(year).slice(2)}`,
        amount: amt,
      };
    });

    return {
      chartData,
      bestMonth,
      avgMonthly,
    };
  }, [savings, totals.allTimeTotal]);

  const PIE_COLORS = ['#1b382b', '#c6784e', '#39715c', '#72b799', '#d9946e', '#88c2a4', '#b86e48'];

  if (savings.length === 0) {
    return (
      <>
        <div className="mb-7">
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">Analytics</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Financial Intelligence.</h1>
        </div>
        <EmptyState
          title="No savings data yet"
          body="Start recording your savings to unlock real-time financial analytics, trend charts, and goal progress."
          icon={BarChart3}
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">Real-Time Analytics</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Savings Analytics.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowPdfModal(true)}
            className="h-10 text-xs font-semibold whitespace-nowrap"
          >
            <FileText size={15} /> Export Monthly Report as PDF
          </Button>

          {/* Date Range Filter Selector */}
          <div className="flex rounded-xl border border-border bg-card p-1 overflow-x-auto max-w-full">
            {[
              ['7d', '7 Days'],
              ['30d', '30 Days'],
              ['3m', '3 Months'],
              ['6m', '6 Months'],
              ['1y', '1 Year'],
              ['all', 'All Time']
            ].map(([v, l]) => (
              <button
                key={v}
                className={`touch-target rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${range === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                onClick={() => setRange(v as any)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* A. Total Saved Breakdown Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today</p>
          <p className="mt-2 font-mono-ui text-xl sm:text-2xl font-bold text-foreground">{formatINR(totals.todayTotal)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">This Week</p>
          <p className="mt-2 font-mono-ui text-xl sm:text-2xl font-bold text-foreground">{formatINR(totals.weekTotal)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">This Month</p>
          <p className="mt-2 font-mono-ui text-xl sm:text-2xl font-bold text-[#39715c]">{formatINR(totals.monthTotal)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">This Year</p>
          <p className="mt-2 font-mono-ui text-xl sm:text-2xl font-bold text-foreground">{formatINR(totals.yearTotal)}</p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-border bg-primary p-4 text-primary-foreground shadow-sm">
          <p className="text-xs font-semibold text-primary-foreground/70 uppercase tracking-wider">All Time</p>
          <p className="mt-2 font-mono-ui text-xl sm:text-2xl font-bold">{formatINR(totals.allTimeTotal)}</p>
        </div>
      </div>

      {/* B. Interactive Savings Trend Line Chart */}
      <section className="mt-6 rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-2xl">Savings Trend</h2>
            <p className="text-xs text-muted-foreground">Showing actual deposits across {range.toUpperCase()}</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-primary inline-block" /> Daily Deposit</span>
            <span className="font-mono-ui font-bold text-foreground">Total: {formatINR(totalRangeSaved)}</span>
          </div>
        </div>

        {trendChartData.length > 0 ? (
          <div className="h-64 sm:h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1b382b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#1b382b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="displayDate" stroke="#888888" fontSize={11} tickLine={false} />
                <YAxis stroke="#888888" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-border bg-card p-3 shadow-xl text-xs">
                          <p className="font-bold text-foreground">{dateLabel(data.date)}</p>
                          <p className="mt-1 font-mono-ui text-[#39715c] font-bold">Deposit: {formatINR(data.deposit)}</p>
                          <p className="font-mono-ui text-muted-foreground text-[11px]">Cumulative: {formatINR(data.cumulative)}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="deposit" stroke="#1b382b" strokeWidth={2.5} fillOpacity={1} fill="url(#savingsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">No deposit entries recorded in this range.</p>
        )}
      </section>

      {/* C. Category Analytics & E. Monthly Savings */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Category Analytics */}
        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-2xl">Category Analytics</h2>
                <p className="text-xs text-muted-foreground">Savings distribution by money source</p>
              </div>
              <PieChartIcon size={20} className="text-primary" />
            </div>

            {categoryAnalytics.length > 0 ? (
              <div className="space-y-3 mt-4">
                {categoryAnalytics.map((c, idx) => (
                  <div key={c.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="text-lg">{c.icon}</span>
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground font-mono-ui">({c.percentage}%)</span>
                      </span>
                      <span className="font-mono-ui font-bold text-foreground">{formatINR(c.total)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${c.percentage}%`,
                          backgroundColor: PIE_COLORS[idx % PIE_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">No categories available.</p>
            )}
          </div>
        </section>

        {/* E. Monthly Savings Trend */}
        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-2xl">Monthly Savings</h2>
                <p className="text-xs text-muted-foreground">Historical savings by month</p>
              </div>
              <CalendarIcon size={20} className="text-primary" />
            </div>

            {monthlySavings.chartData.length > 0 ? (
              <div className="h-60 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlySavings.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} />
                    <YAxis stroke="#888888" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-xl border border-border bg-card p-2.5 shadow-xl text-xs font-mono-ui">
                              <p className="font-bold text-foreground">{data.name}</p>
                              <p className="text-[#39715c] font-bold mt-0.5">{formatINR(data.amount)}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="amount" fill="#39715c" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">No monthly history yet.</p>
            )}
          </div>
        </section>
      </div>

      {/* D. Goal Analytics */}
      <section className="mt-6 rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-2xl">Goal Analytics</h2>
            <p className="text-xs text-muted-foreground">Progress and remaining targets for all goals</p>
          </div>
          <Target size={20} className="text-primary" />
        </div>

        {goalAnalytics.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {goalAnalytics.map((g: any) => (
              <div key={g.id} className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{g.icon}</span>
                    <div>
                      <h3 className="font-display text-base font-bold truncate max-w-[150px]">{g.name}</h3>
                      <p className="text-[11px] text-muted-foreground">{g.is_main ? 'Main Goal' : 'Goal'}</p>
                    </div>
                  </div>
                  <span className="font-mono-ui text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                    {g.progress}%
                  </span>
                </div>

                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${g.progress}%` }} />
                </div>

                <div className="grid grid-cols-3 gap-1 text-[11px] font-mono-ui pt-1 border-t border-border/40">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">TARGET</span>
                    <span className="font-bold">{formatINR(g.target_amount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">SAVED</span>
                    <span className="font-bold text-[#39715c]">{formatINR(g.saved_amount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">REMAINING</span>
                    <span className="font-bold text-[#c6784e]">{formatINR(g.remaining_amount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-6">No goals created yet.</p>
        )}
      </section>

      {/* Financial Insights (Best Month, Average Deposit, Average Monthly) */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Best Saving Month</p>
          <p className="mt-2 font-display text-2xl font-bold text-foreground">
            {monthlySavings.bestMonth.monthStr
              ? `${MONTH_NAMES[Number(monthlySavings.bestMonth.monthStr.split('-')[1]) - 1]} ${monthlySavings.bestMonth.monthStr.split('-')[0]}`
              : 'N/A'}
          </p>
          <p className="mt-1 font-mono-ui text-sm font-semibold text-[#39715c]">
            {monthlySavings.bestMonth.amount > 0 ? formatINR(monthlySavings.bestMonth.amount) : '₹0'}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Average per Deposit</p>
          <p className="mt-2 font-mono-ui text-2xl font-bold text-foreground">{formatINR(avgSavingDeposit)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Across {filteredSavings.length} transactions</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Average Monthly Saved</p>
          <p className="mt-2 font-mono-ui text-2xl font-bold text-foreground">{formatINR(monthlySavings.avgMonthly)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Across active months</p>
        </div>
      </div>

      {showPdfModal && (
        <ExportPdfReportModal onClose={() => setShowPdfModal(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Budget Page (Strict Prompt Section #9, #10, #11, #12)
// ---------------------------------------------------------------------------
function BudgetPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [activeMonth, setActiveMonth] = useState<number>(now.getMonth() + 1);
  const [activeYear, setActiveYear] = useState<number>(now.getFullYear());
  const [modal, setModal] = useState<any>(null);
  const [deleteBudgetConfirm, setDeleteBudgetConfirm] = useState<any>(null);

  const budgetsQuery = useQuery({
    queryKey: ['budgets', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('*, categories(*), goals(*)')
        .eq('user_id', user.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  const savingsQuery = useQuery({
    queryKey: ['savings', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('savings').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
  });

  const goalsQuery = useQuery({
    queryKey: ['goals', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
  });

  const budgets = budgetsQuery.data || [];
  const savings = savingsQuery.data || [];
  const categories = categoriesQuery.data || [];
  const goals = goalsQuery.data || [];

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (activeMonth === 1) {
      setActiveMonth(12);
      setActiveYear(y => y - 1);
    } else {
      setActiveMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (activeMonth === 12) {
      setActiveMonth(1);
      setActiveYear(y => y + 1);
    } else {
      setActiveMonth(m => m + 1);
    }
  };

  const monthStr = `${activeYear}-${String(activeMonth).padStart(2, '0')}`;

  const monthSavings = useMemo(() => {
    return savings.filter((s: any) => (s.saving_date || '').startsWith(monthStr));
  }, [savings, monthStr]);

  const totalMonthActualSaved = useMemo(() => {
    return monthSavings.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
  }, [monthSavings]);

  const activeMonthBudgets = useMemo(() => {
    return budgets.filter((b: any) => Number(b.month) === activeMonth && Number(b.year) === activeYear);
  }, [budgets, activeMonth, activeYear]);

  const overallBudget = activeMonthBudgets.find((b: any) => b.budget_type === 'overall');

  const calculatedBudgets = useMemo(() => {
    return activeMonthBudgets.map((b: any) => {
      let actualSaved = 0;
      if (b.budget_type === 'overall') {
        actualSaved = totalMonthActualSaved;
      } else if (b.budget_type === 'category' && b.category_id) {
        actualSaved = monthSavings
          .filter((s: any) => s.category_id === b.category_id)
          .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
      } else if (b.budget_type === 'goal' && b.goal_id) {
        actualSaved = monthSavings
          .filter((s: any) => s.goal_id === b.goal_id && s.is_goal_linked !== false)
          .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
      }

      const target = Number(b.target_amount || 0);
      const remaining = Math.max(0, target - actualSaved);
      const isExceeded = actualSaved > target;
      const progress = target > 0 ? Math.round((actualSaved / target) * 100) : 0;

      return {
        ...b,
        actualSaved,
        target,
        remaining,
        isExceeded,
        progress,
      };
    });
  }, [activeMonthBudgets, totalMonthActualSaved, monthSavings]);

  const budgetHistory = useMemo(() => {
    const historicalMap: Record<string, { year: number; month: number; target: number; actual: number }> = {};
    
    budgets.forEach((b: any) => {
      const ym = `${b.year}-${String(b.month).padStart(2, '0')}`;
      if (ym < `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`) {
        if (!historicalMap[ym]) {
          historicalMap[ym] = { year: Number(b.year), month: Number(b.month), target: 0, actual: 0 };
        }
        if (b.budget_type === 'overall') {
          historicalMap[ym].target += Number(b.target_amount || 0);
        }
      }
    });

    Object.keys(historicalMap).forEach(ym => {
      const actual = savings
        .filter((s: any) => (s.saving_date || '').startsWith(ym))
        .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
      historicalMap[ym].actual = actual;
    });

    return Object.entries(historicalMap).sort(([a], [b]) => b.localeCompare(a));
  }, [budgets, savings, now]);

  const deleteBudget = (bId: string) => {
    setDeleteBudgetConfirm(bId);
  };

  return (
    <>
      {/* Header & Month Selector */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">Targets & Limits</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Savings Budget.</h1>
        </div>
        <Button onClick={() => setModal({})}>
          <Plus size={18} /> Set Budget
        </Button>
      </div>

      {/* Month Navigator Toolbar */}
      <div className="mb-6 flex items-center justify-between rounded-2xl border border-border bg-card p-3 shadow-xs">
        <button
          onClick={handlePrevMonth}
          className="touch-target grid h-10 w-10 place-items-center rounded-xl hover:bg-muted text-foreground"
          title="Previous Month"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="font-display text-xl sm:text-2xl font-bold">{MONTH_NAMES[activeMonth - 1]} {activeYear}</p>
          <p className="text-xs text-muted-foreground font-mono-ui">
            {monthSavings.length} {monthSavings.length === 1 ? 'saving' : 'savings'} recorded this month
          </p>
        </div>
        <button
          onClick={handleNextMonth}
          className="touch-target grid h-10 w-10 place-items-center rounded-xl hover:bg-muted text-foreground"
          title="Next Month"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Overall Monthly Budget Hero Card */}
      {overallBudget ? (
        (() => {
          const target = Number(overallBudget.target_amount || 0);
          const progress = pct(totalMonthActualSaved, target);
          const isOver = totalMonthActualSaved > target;
          const remaining = Math.max(0, target - totalMonthActualSaved);

          return (
            <div className="mb-7 rounded-[1.8rem] bg-primary p-6 text-primary-foreground sm:p-8 shadow-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary-foreground/60 font-semibold">MONTHLY SAVINGS BUDGET</p>
                  <h2 className="mt-1 font-display text-3xl sm:text-4xl tracking-tight">
                    {MONTH_NAMES[activeMonth - 1]} {activeYear}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-accent px-3 py-1 font-mono-ui text-xs font-bold text-primary">
                    {progress}%
                  </span>
                  <button
                    onClick={() => setModal({ budget: overallBudget })}
                    className="touch-target rounded-lg p-1.5 hover:bg-primary-foreground/10 text-primary-foreground/70 hover:text-primary-foreground"
                    title="Edit Budget"
                  >
                    <Edit3 size={17} />
                  </button>
                </div>
              </div>

              <div className="mt-8 flex items-baseline justify-between">
                <p className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
                  {formatINR(totalMonthActualSaved)}
                </p>
                <p className="text-sm font-semibold text-primary-foreground/60">
                  Target: {formatINR(target)}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="mt-4 h-3.5 overflow-hidden rounded-full bg-primary-foreground/15">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-primary-foreground/65 font-medium">
                <span>
                  {isOver
                    ? `🎉 Budget reached! (${formatINR(totalMonthActualSaved - target)} over target)`
                    : totalMonthActualSaved === target
                    ? '🎉 Exactly reached target!'
                    : `${progress}% of target saved`}
                </span>
                <span>{!isOver && `${formatINR(remaining)} remaining`}</span>
              </div>
            </div>
          );
        })()
      ) : (
        <div className="mb-7 rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
          <p className="text-sm font-semibold text-foreground">No overall budget set for {MONTH_NAMES[activeMonth - 1]} {activeYear}</p>
          <p className="mt-1 text-xs text-muted-foreground">Setting a monthly savings target helps you stay disciplined.</p>
          <Button onClick={() => setModal({ budget: { budget_type: 'overall', month: activeMonth, year: activeYear } })} className="mt-4 h-10 text-xs">
            <Plus size={14} /> Set {MONTH_NAMES[activeMonth - 1]} Budget
          </Button>
        </div>
      )}

      {/* Specific Category and Goal Budgets for this Month */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">Category & Goal Budgets</h2>
          <Button variant="outline" className="h-9 text-xs" onClick={() => setModal({})}>
            <Plus size={14} /> Add Specific Budget
          </Button>
        </div>

        {calculatedBudgets.filter(b => b.budget_type !== 'overall').length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {calculatedBudgets.filter(b => b.budget_type !== 'overall').map((b: any) => (
              <div key={b.id} className="rounded-3xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">
                        {b.budget_type === 'category' ? b.categories?.icon || '💰' : b.goals?.icon || '🎯'}
                      </span>
                      <div>
                        <h3 className="font-display text-lg font-bold">
                          {b.budget_type === 'category' ? b.categories?.name || 'Category' : b.goals?.name || 'Goal'}
                        </h3>
                        <p className="text-[11px] text-muted-foreground uppercase font-mono-ui">
                          {b.budget_type} budget
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setModal({ budget: b })}
                        className="touch-target p-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => deleteBudget(b.id)}
                        className="touch-target p-1.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 flex items-baseline justify-between text-sm">
                    <span className="font-mono-ui font-bold text-foreground text-lg">{formatINR(b.actualSaved)}</span>
                    <span className="text-xs text-muted-foreground">of {formatINR(b.target)}</span>
                  </div>

                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${b.isExceeded ? 'bg-[#39715c]' : 'bg-[#c6784e]'}`}
                      style={{ width: `${Math.min(100, b.progress)}%` }}
                    />
                  </div>

                  <div className="mt-2 flex justify-between text-[11px] font-medium text-muted-foreground">
                    <span>{b.progress}%</span>
                    <span>
                      {b.isExceeded ? 'Target reached' : `${formatINR(b.remaining)} left`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground p-6 rounded-2xl border border-dashed border-border text-center">
            No specific category or goal budgets created for this month.
          </p>
        )}
      </section>

      {/* Budget History (Previous Months) */}
      {budgetHistory.length > 0 && (
        <section className="mt-8 rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <History size={20} className="text-primary" />
            <h2 className="font-display text-2xl">Budget History</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {budgetHistory.map(([ym, data]) => {
              const target = data.target;
              const actual = data.actual;
              const p = target > 0 ? Math.round((actual / target) * 100) : 0;
              return (
                <div key={ym} className="rounded-2xl border border-border bg-muted/30 p-4">
                  <p className="font-display text-base font-bold">{MONTH_NAMES[data.month - 1]} {data.year}</p>
                  <div className="mt-2 flex justify-between text-xs font-mono-ui">
                    <span className="text-muted-foreground">Target: {formatINR(target)}</span>
                    <span className="font-bold text-[#39715c]">Saved: {formatINR(actual)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, p)}%` }} />
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground text-right">{p}% achieved</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {modal && (
        <SetBudgetModal
          initial={modal.budget}
          onClose={() => setModal(null)}
          categories={categories}
          goals={goals}
          activeMonth={activeMonth}
          activeYear={activeYear}
        />
      )}

      {deleteBudgetConfirm && (
        <ConfirmModal
          title="Delete budget target?"
          eyebrow="Delete Budget"
          message="Are you sure you want to delete this budget target? This will remove the savings target for this month."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={async () => {
            const { error } = await supabase.from('budgets').delete().eq('id', deleteBudgetConfirm);
            if (error) throw new Error(error.message || 'Failed to delete budget.');
            await qc.invalidateQueries({ queryKey: ['budgets'] });
          }}
          onClose={() => setDeleteBudgetConfirm(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Money Lent (Lend & Borrow) Page (Strict Prompt Sections #3, #4, #5, #6, #7, #8)
// ---------------------------------------------------------------------------
function MoneyLentPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = todayStr();
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Partially Returned' | 'Returned' | 'Overdue'>('All');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState<any>(null);
  const [repayModal, setRepayModal] = useState<any>(null);
  const [historyModal, setHistoryModal] = useState<any>(null);
  const [deleteLendConfirm, setDeleteLendConfirm] = useState<any>(null);
  const [settleLendConfirm, setSettleLendConfirm] = useState<any>(null);

  // Fetch Money Lent Records
  const moneyLentQuery = useQuery({
    queryKey: ['money_lent', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('money_lent')
        .select('*')
        .eq('user_id', user.id)
        .order('lent_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  // Fetch Repayments
  const repaymentsQuery = useQuery({
    queryKey: ['money_lent_repayments', 'all', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('money_lent_repayments')
        .select('*')
        .eq('user_id', user.id);
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  const moneyLent = moneyLentQuery.data || [];
  const repayments = repaymentsQuery.data || [];

  // Calculate detailed status and remaining balance for each record
  const calculatedLending = useMemo(() => {
    return moneyLent.map((l: any) => {
      const reps = repayments.filter((r: any) => r.money_lent_id === l.id);
      const repaid = reps.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      const totalAmt = Number(l.amount || 0);
      const remaining = Math.max(0, totalAmt - repaid);
      const isOverdue = remaining > 0 && l.due_date && l.due_date < today;

      let computedStatus = l.status;
      if (repaid >= totalAmt - 0.01) {
        computedStatus = 'Returned';
      } else if (repaid > 0) {
        computedStatus = isOverdue ? 'Overdue' : 'Partially Returned';
      } else if (isOverdue) {
        computedStatus = 'Overdue';
      } else {
        computedStatus = 'Pending';
      }

      return {
        ...l,
        repaid_amount: repaid,
        remaining,
        computed_status: computedStatus,
        is_overdue: isOverdue,
        repayment_count: reps.length,
      };
    });
  }, [moneyLent, repayments, today]);

  // Totals for Dashboard
  const metrics = useMemo(() => {
    const totalLent = calculatedLending.reduce((sum, l) => sum + Number(l.amount || 0), 0);
    const totalPending = calculatedLending.reduce((sum, l) => sum + l.remaining, 0);
    const totalReturned = calculatedLending.reduce((sum, l) => sum + l.repaid_amount, 0);
    const totalOverdue = calculatedLending.filter(l => l.is_overdue).reduce((sum, l) => sum + l.remaining, 0);

    return { totalLent, totalPending, totalReturned, totalOverdue };
  }, [calculatedLending]);

  // Filter & Search
  const filtered = useMemo(() => {
    return calculatedLending.filter((l: any) => {
      const matchesSearch = l.person_name.toLowerCase().includes(search.toLowerCase()) || (l.note || '').toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (filter === 'All') return true;
      if (filter === 'Overdue') return l.is_overdue;
      if (filter === 'Returned') return l.computed_status === 'Returned';
      if (filter === 'Partially Returned') return l.computed_status === 'Partially Returned';
      if (filter === 'Pending') return l.computed_status === 'Pending' && !l.is_overdue;
      return true;
    });
  }, [calculatedLending, filter, search]);

  // Mark Full Amount as Returned
  const markAsReturned = (record: any) => {
    if (record.remaining <= 0) return;
    setSettleLendConfirm(record);
  };

  const deleteLendingRecord = (rec: any) => {
    setDeleteLendConfirm(rec);
  };

  return (
    <>
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">Money Owed</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Money Lent.</h1>
        </div>
        <Button onClick={() => setShowAddModal({})}>
          <Plus size={18} /> Lend Money
        </Button>
      </div>

      {/* Metrics Dashboard Cards (Strict Prompt Section #4) */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4 mb-7">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Lent</p>
          <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-foreground">{formatINR(metrics.totalLent)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pending</p>
          <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-[#b86e48]">{formatINR(metrics.totalPending)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Returned</p>
          <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-[#39715c]">{formatINR(metrics.totalReturned)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overdue</p>
          <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-destructive">{formatINR(metrics.totalOverdue)}</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex rounded-xl border border-border bg-card p-1 overflow-x-auto max-w-full">
          {(['All', 'Pending', 'Partially Returned', 'Returned', 'Overdue'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`touch-target rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${
                filter === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-60">
          <Search className="absolute left-3.5 top-3.5 text-muted-foreground" size={16} />
          <input
            type="search"
            className="h-11 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-accent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search person..."
          />
        </div>
      </div>

      {/* Lending Records List */}
      {moneyLentQuery.isLoading ? (
        <LoadingSkeleton />
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((l: any) => {
            const isFullyReturned = l.computed_status === 'Returned';
            const progress = pct(l.repaid_amount, l.amount);

            return (
              <div
                key={l.id}
                className={`rounded-3xl border p-5 shadow-xs flex flex-col justify-between transition ${
                  l.is_overdue
                    ? 'border-destructive/40 bg-destructive/5'
                    : isFullyReturned
                    ? 'border-border bg-muted/20 opacity-85'
                    : 'border-border bg-card'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-xl font-bold">{l.person_name}</h3>
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-mono-ui text-[10px] font-bold ${
                            l.is_overdue
                              ? 'bg-destructive/15 text-destructive'
                              : isFullyReturned
                              ? 'bg-[#39715c]/15 text-[#39715c]'
                              : l.repaid_amount > 0
                              ? 'bg-accent/20 text-[#b86e48]'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {l.computed_status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Lent on {dateLabel(l.lent_date)} {l.due_date ? `· Due: ${dateLabel(l.due_date)}` : ''}
                      </p>
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => setShowAddModal({ record: l })}
                        className="touch-target p-1.5 text-muted-foreground hover:text-foreground"
                        title="Edit Record"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => deleteLendingRecord(l)}
                        className="touch-target p-1.5 text-muted-foreground hover:text-destructive"
                        title="Delete Record"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {l.note && (
                    <p className="mt-3 text-xs bg-muted/40 p-2.5 rounded-xl text-muted-foreground italic">
                      "{l.note}"
                    </p>
                  )}

                  <div className="mt-5 space-y-2">
                    <div className="flex justify-between items-baseline text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground block">Total Lent</span>
                        <span className="font-mono-ui font-bold text-base">{formatINR(l.amount)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground block">Pending</span>
                        <span className={`font-mono-ui font-bold text-base ${l.remaining > 0 ? 'text-[#b86e48]' : 'text-[#39715c]'}`}>
                          {formatINR(l.remaining)}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#39715c] transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
                      <span>Returned: {formatINR(l.repaid_amount)} ({progress}%)</span>
                      {l.repayment_count > 0 && (
                        <button
                          onClick={() => setHistoryModal(l)}
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <History size={12} /> {l.repayment_count} logs
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {!isFullyReturned && (
                  <div className="mt-5 pt-3 border-t border-border/40 flex gap-2">
                    <Button
                      variant="primary"
                      className="flex-1 h-10 text-xs font-bold"
                      onClick={() => setRepayModal(l)}
                    >
                      <Plus size={14} /> Add Repayment
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 text-xs font-semibold"
                      onClick={() => markAsReturned(l)}
                      title="Mark fully settled"
                    >
                      <CheckCircle2 size={14} className="text-[#39715c]" /> Settled
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No money lent yet"
          body="Keep track of money you lend to friends or colleagues, record partial repayments, and receive due reminders."
          icon={HandCoins}
          action={
            <Button onClick={() => setShowAddModal({})}>
              <Plus size={16} /> Record First Loan
            </Button>
          }
        />
      )}

      {showAddModal && (
        <AddMoneyLentModal
          initial={showAddModal.record}
          onClose={() => setShowAddModal(null)}
        />
      )}

      {repayModal && (
        <AddRepaymentModal
          record={repayModal}
          onClose={() => setRepayModal(null)}
        />
      )}

      {historyModal && (
        <RepaymentHistoryModal
          record={historyModal}
          onClose={() => setHistoryModal(null)}
        />
      )}

      {settleLendConfirm && (
        <ConfirmModal
          title="Mark loan as returned?"
          eyebrow="Settle Loan"
          message={`Mark remaining ${formatINR(settleLendConfirm.remaining)} from ${settleLendConfirm.person_name} as fully returned?`}
          confirmLabel="Mark as Returned"
          cancelLabel="Cancel"
          variant="primary"
          onConfirm={async () => {
            const { error: repErr } = await supabase.from('money_lent_repayments').insert({
              money_lent_id: settleLendConfirm.id,
              user_id: user.id,
              amount: settleLendConfirm.remaining,
              repayment_date: todayStr(),
              note: 'Settled in full',
            });
            if (repErr) throw new Error(repErr.message || 'Failed to settle loan.');

            const { error: updateErr } = await supabase.from('money_lent').update({
              status: 'Returned',
              updated_at: new Date().toISOString()
            }).eq('id', settleLendConfirm.id);
            if (updateErr) throw new Error(updateErr.message || 'Failed to update loan status.');

            await qc.invalidateQueries({ queryKey: ['money_lent'] });
            await qc.invalidateQueries({ queryKey: ['money_lent_repayments'] });
          }}
          onClose={() => setSettleLendConfirm(null)}
        />
      )}

      {deleteLendConfirm && (
        <ConfirmModal
          title="Delete lending record?"
          eyebrow="Delete Record"
          message={`Delete lending record for ${deleteLendConfirm.person_name}? This will remove all associated repayment history.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={async () => {
            const { error } = await supabase.from('money_lent').delete().eq('id', deleteLendConfirm.id);
            if (error) throw new Error(error.message || 'Failed to delete lending record.');
            await qc.invalidateQueries({ queryKey: ['money_lent'] });
            await qc.invalidateQueries({ queryKey: ['money_lent_repayments'] });
          }}
          onClose={() => setDeleteLendConfirm(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Money I Owe (Borrowed Money & Liability Tracker) Page
// ---------------------------------------------------------------------------
function MoneyIOwePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAddModal, setShowAddModal] = useState<any>(null);
  const [repayModal, setRepayModal] = useState<any>(null);
  const [historyModal, setHistoryModal] = useState<any>(null);
  const [deleteConfirmRecord, setDeleteConfirmRecord] = useState<any>(null);
  const [settleConfirmRecord, setSettleConfirmRecord] = useState<any>(null);
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Partially Paid' | 'Paid' | 'Overdue'>('All');
  const [search, setSearch] = useState('');

  const today = todayStr();

  // 1. Fetch Borrowed Money Records
  const borrowedQuery = useQuery({
    queryKey: ['borrowed_money', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('borrowed_money')
        .select('*')
        .eq('user_id', user.id)
        .order('borrowed_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  // 2. Fetch Borrowed Repayments
  const repaymentsQuery = useQuery({
    queryKey: ['borrowed_money_repayments', 'all', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('borrowed_money_repayments')
        .select('*')
        .eq('user_id', user.id);
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  const rawBorrowed = borrowedQuery.data || [];
  const allRepayments = repaymentsQuery.data || [];

  // Compute actual remaining balance, repaid amount, overdue flag, and countdown
  const borrowedWithRepayments = useMemo(() => {
    const list = rawBorrowed.map((b: any) => {
      const reps = allRepayments.filter((r: any) => r.borrowed_money_id === b.id);
      const repaid = reps.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      const totalAmt = Number(b.amount || 0);
      const remaining = Math.max(0, totalAmt - repaid);
      const isOverdue = remaining > 0 && Boolean(b.due_date) && b.due_date < today;

      let calculatedStatus = b.status;
      if (remaining <= 0.01) {
        calculatedStatus = 'Paid';
      } else if (repaid > 0) {
        calculatedStatus = isOverdue ? 'Overdue' : 'Partially Paid';
      } else if (isOverdue) {
        calculatedStatus = 'Overdue';
      } else {
        calculatedStatus = 'Pending';
      }

      const dueInfo = formatDueCountdown(b.due_date);

      return {
        ...b,
        repaid_amount: repaid,
        remaining,
        computed_status: calculatedStatus,
        is_overdue: isOverdue,
        repayment_count: reps.length,
        due_info: dueInfo,
      };
    });

    return sortBorrowedRecords(list);
  }, [rawBorrowed, allRepayments, today]);

  // Dashboard Metrics (Top Cards)
  const metrics = useMemo(() => {
    // 1. Total I Owe: CURRENT remaining amount, not original borrowed amount
    const totalRemaining = borrowedWithRepayments
      .filter((b: any) => b.remaining > 0)
      .reduce((sum: number, b: any) => sum + b.remaining, 0);

    // 2. Due Soon: pending amount for records due in the next 7 days
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    const next7DaysStr = next7Days.toISOString().slice(0, 10);

    const dueSoon = borrowedWithRepayments
      .filter((b: any) => b.remaining > 0 && b.due_date && b.due_date >= today && b.due_date <= next7DaysStr)
      .reduce((sum: number, b: any) => sum + b.remaining, 0);

    // 3. Overdue: pending amount for overdue records
    const overdue = borrowedWithRepayments
      .filter((b: any) => b.is_overdue)
      .reduce((sum: number, b: any) => sum + b.remaining, 0);

    // 4. Paid: total repaid amount across all records
    const totalPaid = borrowedWithRepayments
      .reduce((sum: number, b: any) => sum + Number(b.repaid_amount || 0), 0);

    // 5. People I Owe: count of unique people with remaining balance > 0
    const peopleOwedSet = new Set(
      borrowedWithRepayments
        .filter((b: any) => b.remaining > 0)
        .map((b: any) => (b.person_name || '').trim().toLowerCase())
    );

    return {
      totalIOwe: totalRemaining,
      dueSoon,
      overdue,
      totalPaid,
      peopleCount: peopleOwedSet.size,
    };
  }, [borrowedWithRepayments, today]);

  // Filtering
  const filtered = useMemo(() => {
    return borrowedWithRepayments.filter((b: any) => {
      const q = search.toLowerCase();
      const matchesSearch = (
        (b.person_name || '').toLowerCase().includes(q) ||
        (b.note || '').toLowerCase().includes(q)
      );
      if (!matchesSearch) return false;

      if (filter === 'All') return true;
      if (filter === 'Overdue') return b.is_overdue;
      if (filter === 'Paid') return b.computed_status === 'Paid';
      if (filter === 'Partially Paid') return b.computed_status === 'Partially Paid' && !b.is_overdue;
      if (filter === 'Pending') return b.computed_status === 'Pending' && !b.is_overdue;
      return true;
    });
  }, [borrowedWithRepayments, search, filter]);

  const markAsPaid = (record: any) => {
    if (record.remaining <= 0) return;
    setSettleConfirmRecord(record);
  };

  const deleteBorrowedRecord = (rec: any) => {
    setDeleteConfirmRecord(rec);
  };

  return (
    <>
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">Liabilities & Repayments</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Money I Owe.</h1>
        </div>
        <Button onClick={() => setShowAddModal({})}>
          <Plus size={18} /> Add Money I Owe
        </Button>
      </div>

      {/* Metrics Dashboard Cards (Strict Section #3) */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-5 mb-7">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total I Owe</p>
          <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-[#b86e48]">{formatINR(metrics.totalIOwe)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due Soon</p>
          <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">{formatINR(metrics.dueSoon)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overdue</p>
          <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-destructive">{formatINR(metrics.overdue)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Paid</p>
          <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-[#39715c]">{formatINR(metrics.totalPaid)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">People</p>
          <p className="mt-2.5 font-mono-ui text-xl sm:text-2xl font-bold text-foreground">{metrics.peopleCount}</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex rounded-xl border border-border bg-card p-1 overflow-x-auto max-w-full">
          {(['All', 'Pending', 'Partially Paid', 'Paid', 'Overdue'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`touch-target rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${
                filter === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-60">
          <Search className="absolute left-3.5 top-3.5 text-muted-foreground" size={16} />
          <input
            type="search"
            className="h-11 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-accent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search person or note..."
          />
        </div>
      </div>

      {/* Borrowed Records List */}
      {borrowedQuery.isLoading ? (
        <LoadingSkeleton />
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((b: any) => {
            const isFullyPaid = b.computed_status === 'Paid';
            const progress = pct(b.repaid_amount, b.amount);

            return (
              <div
                key={b.id}
                className={`rounded-3xl border p-5 shadow-xs flex flex-col justify-between transition ${
                  b.is_overdue
                    ? 'border-destructive/40 bg-destructive/5 ring-1 ring-destructive/20'
                    : isFullyPaid
                    ? 'border-border bg-muted/20 opacity-85'
                    : 'border-border bg-card'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-xl font-bold">{b.person_name}</h3>
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-mono-ui text-[10px] font-bold ${
                            b.is_overdue
                              ? 'bg-destructive/15 text-destructive'
                              : isFullyPaid
                              ? 'bg-[#39715c]/15 text-[#39715c]'
                              : b.repaid_amount > 0
                              ? 'bg-accent/20 text-[#b86e48]'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {b.computed_status}
                        </span>

                        {b.due_info && !isFullyPaid && (
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono-ui text-[10px] font-bold ${
                              b.due_info.isOverdue
                                ? 'bg-destructive text-destructive-foreground'
                                : b.due_info.isToday
                                ? 'bg-amber-500 text-white'
                                : 'bg-secondary text-secondary-foreground'
                            }`}
                          >
                            {b.due_info.text}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Borrowed on {dateLabel(b.borrowed_date)} {b.due_date ? `· Due: ${dateLabel(b.due_date)}` : ''}
                      </p>
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => setShowAddModal({ record: b })}
                        className="touch-target p-1.5 text-muted-foreground hover:text-foreground"
                        title="Edit Record"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => deleteBorrowedRecord(b)}
                        className="touch-target p-1.5 text-muted-foreground hover:text-destructive"
                        title="Delete Record"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {b.note && (
                    <p className="mt-3 text-xs bg-muted/40 p-2.5 rounded-xl text-muted-foreground italic">
                      "{b.note}"
                    </p>
                  )}

                  <div className="mt-5 space-y-2">
                    <div className="flex justify-between items-baseline text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground block">Borrowed</span>
                        <span className="font-mono-ui font-bold text-base">{formatINR(b.amount)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground block">Remaining to Repay</span>
                        <span className={`font-mono-ui font-bold text-base ${b.remaining > 0 ? 'text-[#b86e48]' : 'text-[#39715c]'}`}>
                          {formatINR(b.remaining)}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#39715c] transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
                      <span>Repaid: {formatINR(b.repaid_amount)} ({progress}%)</span>
                      <button
                        onClick={() => setHistoryModal(b)}
                        className="text-primary hover:underline flex items-center gap-1 font-semibold"
                      >
                        <History size={12} /> {b.repayment_count > 0 ? `${b.repayment_count} repayments` : 'Details & History'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {!isFullyPaid && (
                  <div className="mt-5 pt-3 border-t border-border/40 flex gap-2">
                    <Button
                      variant="primary"
                      className="flex-1 h-10 text-xs font-bold"
                      onClick={() => setRepayModal(b)}
                    >
                      <Plus size={14} /> Make Repayment
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 text-xs font-semibold"
                      onClick={() => markAsPaid(b)}
                      title="Mark fully settled"
                    >
                      <CheckCircle2 size={14} className="text-[#39715c]" /> Settled
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No borrowed money yet"
          body="Track money you need to repay to friends and family."
          icon={Receipt}
          action={
            <Button onClick={() => setShowAddModal({})}>
              <Plus size={16} /> + Add Money I Owe
            </Button>
          }
        />
      )}

      {showAddModal && (
        <AddBorrowedMoneyModal
          initial={showAddModal.record}
          onClose={() => setShowAddModal(null)}
        />
      )}

      {repayModal && (
        <MakeBorrowedRepaymentModal
          record={repayModal}
          onClose={() => setRepayModal(null)}
        />
      )}

      {historyModal && (
        <BorrowedRepaymentHistoryModal
          record={historyModal}
          onClose={() => setHistoryModal(null)}
          onMakeRepayment={(rec: any) => setRepayModal(rec)}
        />
      )}

      {settleConfirmRecord && (
        <ConfirmModal
          title="Mark debt as settled?"
          eyebrow="Settle Debt"
          message={`Mark remaining ${formatINR(settleConfirmRecord.remaining)} to ${settleConfirmRecord.person_name} as fully settled?`}
          confirmLabel="Mark as Settled"
          cancelLabel="Cancel"
          variant="primary"
          onConfirm={async () => {
            const { error: repErr } = await supabase.from('borrowed_money_repayments').insert({
              borrowed_money_id: settleConfirmRecord.id,
              user_id: user.id,
              amount: settleConfirmRecord.remaining,
              repayment_date: todayStr(),
              note: 'Settled in full',
            });
            if (repErr) throw new Error(repErr.message || 'Failed to settle debt.');

            const { error: updateErr } = await supabase.from('borrowed_money').update({
              status: 'Paid',
              updated_at: new Date().toISOString()
            }).eq('id', settleConfirmRecord.id);
            if (updateErr) throw new Error(updateErr.message || 'Failed to update debt status.');

            await qc.invalidateQueries({ queryKey: ['borrowed_money'] });
            await qc.invalidateQueries({ queryKey: ['borrowed_money_repayments'] });
          }}
          onClose={() => setSettleConfirmRecord(null)}
        />
      )}

      {deleteConfirmRecord && (
        <ConfirmModal
          title="Delete borrowed record?"
          eyebrow="Delete Record"
          message={`Delete the borrowed record for ${deleteConfirmRecord.person_name}? This will remove all associated repayment history.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={async () => {
            const { error } = await supabase.from('borrowed_money').delete().eq('id', deleteConfirmRecord.id);
            if (error) throw new Error(error.message || 'Failed to delete borrowed record.');
            await qc.invalidateQueries({ queryKey: ['borrowed_money'] });
            await qc.invalidateQueries({ queryKey: ['borrowed_money_repayments'] });
          }}
          onClose={() => setDeleteConfirmRecord(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Categories View (Money Sources Management & Goal Linking Overview)
// ---------------------------------------------------------------------------
function CategoriesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState<any>(null);
  const [savingCategory, setSavingCategory] = useState<any>(null);

  const categoriesQuery = useQuery({
    queryKey: ['categories', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const savingsQuery = useQuery({
    queryKey: ['savings', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('savings').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
  });

  const goalsQuery = useQuery({
    queryKey: ['goals', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
  });

  const categories = categoriesQuery.data || [];
  const savings = savingsQuery.data || [];
  const goals = goalsQuery.data || [];

  const categoriesWithCalculated = useMemo(() => {
    return categories.map((c: any) => {
      const catSavings = savings.filter((s: any) => s.category_id === c.id);
      const totalAmount = catSavings.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
      const goalLinkedAmount = catSavings
        .filter((s: any) => s.is_goal_linked && s.goal_id)
        .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
      const flexibleAmount = Math.max(0, totalAmount - goalLinkedAmount);

      return {
        ...c,
        total_amount: totalAmount,
        goal_linked_amount: goalLinkedAmount,
        flexible_amount: flexibleAmount,
        entry_count: catSavings.length,
      };
    });
  }, [categories, savings]);

  const totalAllCategories = useMemo(() => {
    return categoriesWithCalculated.reduce((sum: number, c: any) => sum + c.total_amount, 0);
  }, [categoriesWithCalculated]);

  const saveCategory = async (form: any) => {
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      icon: form.icon || '💰',
    };

    if (modal?.cat?.id) {
      const { error } = await supabase.from('categories').update(payload).eq('id', modal.cat.id);
      if (error) throw new Error(error.message || 'Failed to update category.');
    } else {
      const { error } = await supabase.from('categories').insert(payload);
      if (error) throw new Error(error.message || 'Failed to create category.');
    }

    await qc.invalidateQueries({ queryKey: ['categories'] });
    setModal(null);
  };

  const deleteCategory = async (cat: any) => {
    const linkedCount = savings.filter((s: any) => s.category_id === cat.id).length;
    if (linkedCount > 0) {
      alert(`Cannot delete category "${cat.name}" because you have ${linkedCount} savings transaction(s) recorded under it. To preserve your savings history and financial accuracy, active categories cannot be deleted.`);
      return;
    }
    if (window.confirm(`Are you sure you want to delete the category "${cat.name}"?`)) {
      const { error } = await supabase.from('categories').delete().eq('id', cat.id);
      if (error) {
        alert(error.message || 'Failed to delete category.');
      } else {
        await qc.invalidateQueries({ queryKey: ['categories'] });
      }
    }
  };

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">Money Sources</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Savings Categories.</h1>
        </div>
        <Button onClick={() => setModal({})}>
          <Plus size={18} /> Add Category
        </Button>
      </div>

      {/* Summary Banner */}
      {categories.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Across Categories</p>
            <p className="mt-1 font-mono-ui text-3xl font-bold text-foreground">{formatINR(totalAllCategories)}</p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-xl bg-secondary px-3.5 py-2 font-mono-ui text-xs font-semibold text-secondary-foreground">
              {categories.length} {categories.length === 1 ? 'Category' : 'Categories'}
            </span>
          </div>
        </div>
      )}

      {categoriesQuery.isLoading ? (
        <LoadingSkeleton />
      ) : categoriesWithCalculated.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categoriesWithCalculated.map((c: any) => (
            <div
              key={c.id}
              className="flex flex-col justify-between rounded-3xl border border-border bg-card p-5 shadow-xs transition hover:shadow-md hover:border-border/80"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-2xl shadow-xs">
                    {c.icon}
                  </span>
                  <div className="flex gap-1">
                    <button
                      className="touch-target rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setModal({ cat: c })}
                      title="Edit Category"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      className="touch-target rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteCategory(c)}
                      title="Delete Category"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <h2 className="font-display text-2xl font-bold truncate">{c.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.entry_count} {c.entry_count === 1 ? 'deposit' : 'deposits'}</p>
                </div>

                <div className="mt-5 space-y-2 rounded-2xl bg-muted/40 p-3.5 text-xs font-medium">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Saved:</span>
                    <span className="font-mono-ui font-bold text-foreground">{formatINR(c.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Goal-Linked:</span>
                    <span className="font-mono-ui font-semibold text-[#39715c]">{formatINR(c.goal_linked_amount)}</span>
                  </div>
                  {c.flexible_amount > 0 && (
                    <div className="flex justify-between text-muted-foreground/80">
                      <span>Flexible (Unlinked):</span>
                      <span className="font-mono-ui">{formatINR(c.flexible_amount)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <Button
                  onClick={() => setSavingCategory(c)}
                  className="w-full h-11 text-xs font-bold gap-1.5"
                  variant="outline"
                >
                  <Plus size={15} /> Add Saving to {c.name}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No savings categories yet"
          body="Create your own categories (e.g. YouTube, Salary, Freelance) to start categorizing where your savings come from."
          icon={Wallet}
          action={
            <Button onClick={() => setModal({})}>
              <Plus size={16} /> + Add Category
            </Button>
          }
        />
      )}

      {modal && (
        <CategoryModal
          initial={modal.cat}
          onClose={() => setModal(null)}
          onSubmit={saveCategory}
        />
      )}

      {savingCategory && (
        <AddSavingModal
          onClose={() => setSavingCategory(null)}
          categories={categories}
          goals={goals}
          defaultCategoryId={savingCategory.id}
          onOpenAddCategory={() => {
            setSavingCategory(null);
            setModal({});
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Goals View (Create, Edit, Delete Goals)
// ---------------------------------------------------------------------------
function GoalsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState<any>(null);

  const goalsQuery = useQuery({
    queryKey: ['goals', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const savingsQuery = useQuery({
    queryKey: ['savings', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('savings').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
  });

  const goals = goalsQuery.data || [];
  const savings = savingsQuery.data || [];

  const goalsWithCalculated = useMemo(() => {
    return goals.map((g: any) => {
      const linkedSum = savings
        .filter((s: any) => s.goal_id === g.id && s.is_goal_linked !== false)
        .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
      return {
        ...g,
        saved_amount: Number(g.starting_amount || 0) + linkedSum,
      };
    });
  }, [goals, savings]);

  const saveGoal = async (form: any) => {
    if (!user?.id) throw new Error('Authentication required.');

    const trimmedName = form.name?.trim();
    if (!trimmedName) throw new Error('Goal name is required.');

    const targetAmount = Number(form.target_amount);
    if (!targetAmount || targetAmount <= 0) throw new Error('Target amount must be greater than ₹0.');

    const startingAmount = Number(form.starting_amount || 0);

    const isMain = Boolean(form.is_main);
    if (isMain) {
      await supabase.from('goals').update({ is_main: false }).eq('user_id', user.id);
    }

    const payload = {
      user_id: user.id,
      name: trimmedName,
      icon: form.icon || '🎯',
      target_amount: targetAmount,
      starting_amount: startingAmount,
      target_date: form.target_date?.trim() || null,
      description: form.description?.trim() || null,
      is_main: goals.length === 0 || isMain,
    };

    if (modal?.goal?.id) {
      const { error } = await supabase.from('goals').update(payload).eq('id', modal.goal.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('goals').insert(payload);
      if (error) throw error;
    }

    await qc.invalidateQueries({ queryKey: ['goals'] });
    await qc.invalidateQueries({ queryKey: ['savings'] });
    setModal(null);
  };

  const deleteGoal = async (g: any) => {
    const linkedCount = savings.filter((s: any) => s.goal_id === g.id).length;
    let message = `Delete goal "${g.name}"?`;
    if (linkedCount > 0) {
      message = `Goal "${g.name}" has ${linkedCount} linked deposits. Deleting this goal will un-link these savings so they remain in your categories. Continue?`;
    }
    if (window.confirm(message)) {
      await supabase.from('goals').delete().eq('id', g.id);
      qc.invalidateQueries();
    }
  };

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">Targets</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Savings Goals.</h1>
        </div>
        <Button onClick={() => setModal({})}>
          <Plus size={18} /> New Goal
        </Button>
      </div>

      {goalsQuery.isLoading ? (
        <LoadingSkeleton />
      ) : goalsWithCalculated.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {goalsWithCalculated.map((g: any) => (
            <div
              key={g.id}
              className={`rounded-[1.8rem] border p-6 ${g.is_main ? 'border-primary bg-primary text-primary-foreground shadow-xl' : 'border-border bg-card'}`}
            >
              <div className="flex items-start justify-between">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl text-2xl ${g.is_main ? 'bg-accent text-primary' : 'bg-secondary'}`}>
                  {g.icon}
                </span>
                <div className="flex gap-1">
                  <button className={`touch-target rounded-lg p-2 ${g.is_main ? 'hover:bg-primary-foreground/10' : 'hover:bg-muted'}`} onClick={() => setModal({ goal: g })}>
                    <Edit3 size={17} />
                  </button>
                  <button className={`touch-target rounded-lg p-2 ${g.is_main ? 'hover:bg-primary-foreground/10' : 'hover:bg-destructive/10 hover:text-destructive'}`} onClick={() => deleteGoal(g)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
              <div className="mt-7 flex items-end justify-between">
                <div>
                  <h2 className="font-display text-3xl">{g.name}</h2>
                  <p className={`mt-1 text-sm ${g.is_main ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}>
                    {g.description || 'Target destination.'}
                  </p>
                </div>
                <p className={`font-mono-ui text-sm font-bold ${g.is_main ? 'text-accent' : 'text-[#39715c]'}`}>
                  {pct(g.saved_amount, g.target_amount)}%
                </p>
              </div>
              <div className={`mt-5 h-3 overflow-hidden rounded-full ${g.is_main ? 'bg-primary-foreground/15' : 'bg-muted'}`}>
                <div
                  className={`h-full rounded-full ${g.is_main ? 'bg-accent' : 'bg-[#72b799]'}`}
                  style={{ width: `${pct(g.saved_amount, g.target_amount)}%` }}
                />
              </div>
              <div className={`mt-4 flex justify-between text-xs font-medium ${g.is_main ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}>
                <span>{formatINR(g.saved_amount)} saved</span>
                <span>of {formatINR(g.target_amount)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No savings goals yet"
          body="Creating a goal gives every deposit a clear target and purpose."
          icon={Target}
          action={
            <Button onClick={() => setModal({})}>
              <Plus size={16} /> Create your first goal
            </Button>
          }
        />
      )}

      {modal && <GoalModal initial={modal.goal} onClose={() => setModal(null)} onSubmit={saveGoal} />}
    </>
  );
}

function GoalModal({ initial, onClose, onSubmit }: any) {
  const [name, setName] = useState(initial?.name || '');
  const [icon, setIcon] = useState(initial?.icon || '🎯');
  const [target, setTarget] = useState(initial ? String(initial.target_amount) : '');
  const [starting, setStarting] = useState(initial ? String(initial.starting_amount || 0) : '0');
  const [targetDate, setTargetDate] = useState(initial?.target_date || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [isMain, setIsMain] = useState(initial?.is_main || false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a goal name.');
      return;
    }

    const targetNum = Number(target);
    if (!targetNum || isNaN(targetNum) || targetNum <= 0) {
      setError('Please enter a valid target amount greater than ₹0.');
      return;
    }

    const startingNum = Number(starting || 0);

    try {
      setSubmitting(true);
      await onSubmit({
        name: trimmedName,
        icon: icon || '🎯',
        target_amount: targetNum,
        starting_amount: startingNum,
        target_date: targetDate,
        description,
        is_main: isMain,
      });
    } catch (err: any) {
      console.error('Goal save error:', err);
      setError(err?.message || 'Failed to save goal.');
      setSubmitting(false);
    }
  };

  return (
    <Modal title={initial ? 'Edit goal' : 'Create goal'} eyebrow="Destination" onClose={onClose}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-[72px_1fr] gap-3">
          <Field label="Icon" value={icon} maxLength={8} onChange={(e: any) => setIcon(e.target.value)} />
          <Field label="Goal Name" required value={name} onChange={(e: any) => setName(e.target.value)} placeholder="e.g. Laptop" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target Amount (₹)" type="number" min="1" step="any" required value={target} onChange={(e: any) => setTarget(e.target.value)} />
          <Field label="Already Saved (₹)" type="number" min="0" step="any" value={starting} onChange={(e: any) => setStarting(e.target.value)} />
        </div>
        <Field label="Target Date (optional)" type="date" value={targetDate} onChange={(e: any) => setTargetDate(e.target.value)} />
        <label className="grid gap-1.5 text-sm font-medium">
          Description
          <textarea
            className="min-h-20 resize-none rounded-xl border border-input bg-card p-3.5 outline-none focus:border-accent"
            maxLength={240}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why this matters to you"
          />
        </label>
        <label className="flex items-center gap-3 rounded-xl bg-muted p-3.5 text-sm cursor-pointer">
          <input type="checkbox" checked={isMain} onChange={(e) => setIsMain(e.target.checked)} className="h-5 w-5 rounded text-primary focus:ring-accent" />
          <span><b>Make this my Main Goal</b><br /><small className="text-muted-foreground">Primary focus on dashboard</small></span>
        </label>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        <Button disabled={submitting} type="submit" className="mt-2 w-full h-12">
          {submitting ? <Loader2 className="animate-spin" size={17} /> : null}
          {initial ? (submitting ? 'Updating Goal...' : 'Update Goal') : (submitting ? 'Creating Goal...' : 'Create Goal')}
          {!submitting && <ArrowRight size={17} />}
        </Button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Export Monthly Report as PDF Modal Component
// ---------------------------------------------------------------------------
function ExportPdfReportModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleGenerate = async (mode: 'download' | 'preview') => {
    if (generating) return;
    setError('');
    setSuccessMsg('');
    setGenerating(true);

    try {
      const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
      const monthName = MONTH_NAMES[month - 1] || 'Month';

      // 1. Fetch real Supabase data for the authenticated user
      const [
        savingsRes,
        categoriesRes,
        goalsRes,
        budgetsRes,
        lentRes,
        lentRepRes,
        borrowRes,
        borrowRepRes,
      ] = await Promise.all([
        supabase.from('savings').select('*, categories(*), goals(*)').eq('user_id', user.id),
        supabase.from('categories').select('*').eq('user_id', user.id),
        supabase.from('goals').select('*').eq('user_id', user.id),
        supabase.from('budgets').select('*, categories(*), goals(*)').eq('user_id', user.id),
        supabase.from('money_lent').select('*').eq('user_id', user.id),
        supabase.from('money_lent_repayments').select('*, money_lent(*)').eq('user_id', user.id),
        supabase.from('borrowed_money').select('*').eq('user_id', user.id),
        supabase.from('borrowed_money_repayments').select('*, borrowed_money(*)').eq('user_id', user.id),
      ]);

      if (savingsRes.error && !isSchemaCacheError(savingsRes.error)) throw savingsRes.error;
      if (categoriesRes.error && !isSchemaCacheError(categoriesRes.error)) throw categoriesRes.error;
      if (goalsRes.error && !isSchemaCacheError(goalsRes.error)) throw goalsRes.error;

      const allSavings = savingsRes.data || [];
      const allCategories = categoriesRes.data || [];
      const allGoals = goalsRes.data || [];
      const allBudgets = budgetsRes.data || [];
      const allMoneyLent = lentRes.data || [];
      const allLentRepayments = lentRepRes.data || [];
      const allBorrowed = borrowRes.data || [];
      const allBorrowedRepayments = borrowRepRes.data || [];

      // Filter month specific records
      const monthSavings = allSavings.filter((s: any) => (s.saving_date || s.date || '').startsWith(monthPrefix));
      const monthLent = allMoneyLent.filter((l: any) => (l.lent_date || '').startsWith(monthPrefix));
      const monthLentRepayments = allLentRepayments.filter((r: any) => (r.repayment_date || '').startsWith(monthPrefix));
      const monthBorrowed = allBorrowed.filter((b: any) => (b.borrowed_date || '').startsWith(monthPrefix));
      const monthBorrowedRepayments = allBorrowedRepayments.filter((r: any) => (r.repayment_date || '').startsWith(monthPrefix));

      // A. Savings aggregation
      const totalSaved = monthSavings.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
      const savingsCount = monthSavings.length;

      let highestSaving: any = null;
      monthSavings.forEach((s: any) => {
        const amt = Number(s.amount || 0);
        if (!highestSaving || amt > highestSaving.amount) {
          highestSaving = {
            amount: amt,
            category: s.categories?.name || 'Deposit',
            date: dateLabel(s.saving_date || s.date),
          };
        }
      });

      const goalLinkedSavings = monthSavings
        .filter((s: any) => s.goal_id && s.is_goal_linked !== false)
        .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);

      // Categories breakdown
      const catMap: Record<string, { name: string; icon: string; total: number; count: number }> = {};
      monthSavings.forEach((s: any) => {
        const cId = s.category_id || 'other';
        const cName = s.categories?.name || 'Other';
        const cIcon = s.categories?.icon || '💰';
        if (!catMap[cId]) {
          catMap[cId] = { name: cName, icon: cIcon, total: 0, count: 0 };
        }
        catMap[cId].total += Number(s.amount || 0);
        catMap[cId].count += 1;
      });

      const categoriesBreakdown = Object.values(catMap).map(c => ({
        ...c,
        percentage: totalSaved > 0 ? Math.round((c.total / totalSaved) * 100) : 0,
      }));

      // B. Income breakdown
      const incomeCategories = allCategories.filter((c: any) => (c.name || '').toLowerCase().includes('income') || (c.name || '').toLowerCase().includes('salary'));
      let totalIncome = 0;
      const incomeBreakdown: any[] = [];

      if (incomeCategories.length > 0) {
        incomeCategories.forEach((ic: any) => {
          const icSavings = monthSavings.filter((s: any) => s.category_id === ic.id);
          const icTotal = icSavings.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
          if (icTotal > 0) {
            totalIncome += icTotal;
            incomeBreakdown.push({
              source: ic.name,
              total: icTotal,
              count: icSavings.length,
            });
          }
        });
      }

      const savingsRate = totalIncome > 0 ? Math.min(100, Math.round((totalSaved / totalIncome) * 100)) : null;

      // C. Budgets for month
      const monthBudgets = allBudgets.filter((b: any) => Number(b.month) === month && Number(b.year) === year);
      const overallBudget = monthBudgets.find((b: any) => b.budget_type === 'overall');
      const budgetTarget = overallBudget ? Number(overallBudget.target_amount || 0) : 0;
      const budgetAchieved = totalSaved;
      const budgetPercentage = budgetTarget > 0 ? Math.round((budgetAchieved / budgetTarget) * 100) : 0;

      const budgetsList = monthBudgets.map((b: any) => {
        let bActual = 0;
        let bName = 'Overall Monthly Budget';
        if (b.budget_type === 'category') {
          bName = `Category: ${b.categories?.name || 'Category'}`;
          bActual = monthSavings.filter((s: any) => s.category_id === b.category_id).reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
        } else if (b.budget_type === 'goal') {
          bName = `Goal: ${b.goals?.name || 'Goal'}`;
          bActual = monthSavings.filter((s: any) => s.goal_id === b.goal_id).reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
        } else {
          bActual = totalSaved;
        }
        const bTarget = Number(b.target_amount || 0);
        return {
          name: bName,
          type: b.budget_type,
          target: bTarget,
          actual: bActual,
          remaining: Math.max(0, bTarget - bActual),
          percentage: bTarget > 0 ? Math.round((bActual / bTarget) * 100) : 0,
        };
      });

      // D. Goals summary for goals with activity in this month
      const goalsList: any[] = [];
      allGoals.forEach((g: any) => {
        const goalMonthSavings = monthSavings.filter((s: any) => s.goal_id === g.id && s.is_goal_linked !== false);
        const monthContributed = goalMonthSavings.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);

        const allGoalSavings = allSavings.filter((s: any) => s.goal_id === g.id && s.is_goal_linked !== false);
        const totalLinked = allGoalSavings.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
        const overallSaved = Number(g.starting_amount || 0) + totalLinked;
        const targetAmt = Number(g.target_amount || 0);
        const overallProgress = pct(overallSaved, targetAmt);

        if (monthContributed > 0 || monthSavings.length === 0) {
          goalsList.push({
            name: g.name,
            icon: g.icon || '🎯',
            contributedThisMonth: monthContributed,
            overallSaved,
            targetAmount: targetAmt,
            overallProgress,
          });
        }
      });

      // E. Money Lent summary
      const totalMoneyLent = monthLent.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
      const totalMoneyReceivedBack = monthLentRepayments.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

      const moneyLentList: any[] = [];
      const relevantLentIds = new Set([
        ...monthLent.map((l: any) => l.id),
        ...monthLentRepayments.map((r: any) => r.money_lent_id),
      ]);

      allMoneyLent.forEach((l: any) => {
        if (relevantLentIds.has(l.id)) {
          const lMonthLent = monthLent.filter((m: any) => m.id === l.id).reduce((sum: number, m: any) => sum + Number(m.amount || 0), 0);
          const lMonthReturned = monthLentRepayments.filter((r: any) => r.money_lent_id === l.id).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
          const allLreps = allLentRepayments.filter((r: any) => r.money_lent_id === l.id);
          const totalRepaid = allLreps.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
          const remaining = Math.max(0, Number(l.amount || 0) - totalRepaid);

          moneyLentList.push({
            person: l.person_name,
            lentInMonth: lMonthLent,
            returnedInMonth: lMonthReturned,
            totalLent: Number(l.amount || 0),
            totalReturned: totalRepaid,
            remaining,
            status: remaining <= 0.01 ? 'Returned' : totalRepaid > 0 ? 'Partially Returned' : 'Pending',
          });
        }
      });

      // F. Money I Owe (Liabilities) summary
      const totalMoneyBorrowed = monthBorrowed.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);
      const totalRepaymentsMade = monthBorrowedRepayments.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

      // Current overall unpaid liability balance
      const currentOutstandingMoneyIOwe = allBorrowed.reduce((sum: number, b: any) => {
        const reps = allBorrowedRepayments.filter((r: any) => r.borrowed_money_id === b.id);
        const totalRepaid = reps.reduce((rSum: number, r: any) => rSum + Number(r.amount || 0), 0);
        return sum + Math.max(0, Number(b.amount || 0) - totalRepaid);
      }, 0);

      const moneyIOweList: any[] = [];
      const relevantBorrowIds = new Set([
        ...monthBorrowed.map((b: any) => b.id),
        ...monthBorrowedRepayments.map((r: any) => r.borrowed_money_id),
      ]);

      allBorrowed.forEach((b: any) => {
        if (relevantBorrowIds.has(b.id)) {
          const bMonthBorrowed = monthBorrowed.filter((m: any) => m.id === b.id).reduce((sum: number, m: any) => sum + Number(m.amount || 0), 0);
          const bMonthRepaid = monthBorrowedRepayments.filter((r: any) => r.borrowed_money_id === b.id).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
          const allBreps = allBorrowedRepayments.filter((r: any) => r.borrowed_money_id === b.id);
          const totalRepaid = allBreps.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
          const remaining = Math.max(0, Number(b.amount || 0) - totalRepaid);

          moneyIOweList.push({
            person: b.person_name,
            borrowedInMonth: bMonthBorrowed,
            repaidInMonth: bMonthRepaid,
            totalBorrowed: Number(b.amount || 0),
            totalRepaid,
            remaining,
            dueDate: b.due_date,
            status: remaining <= 0.01 ? 'Paid' : totalRepaid > 0 ? 'Partially Paid' : 'Pending',
          });
        }
      });

      // G. Unified transactions in month
      const transactions: any[] = [];

      monthSavings.forEach((s: any) => {
        transactions.push({
          date: s.saving_date || s.date || (s.created_at || '').slice(0, 10),
          type: 'SAVINGS',
          title: s.categories?.name || 'Savings Deposit',
          categoryOrPerson: s.categories?.name || 'Savings',
          amount: Number(s.amount || 0),
          isPositive: true,
          note: s.is_goal_linked && s.goals?.name ? `For ${s.goals.name}` : s.note || '',
        });
      });

      monthLent.forEach((l: any) => {
        transactions.push({
          date: l.lent_date || (l.created_at || '').slice(0, 10),
          type: 'LENT',
          title: `Lent to ${l.person_name}`,
          categoryOrPerson: l.person_name,
          amount: Number(l.amount || 0),
          isPositive: false,
          note: l.note || '',
        });
      });

      monthLentRepayments.forEach((r: any) => {
        transactions.push({
          date: r.repayment_date || (r.created_at || '').slice(0, 10),
          type: 'RECEIVED',
          title: `Repayment from ${r.money_lent?.person_name || 'Borrower'}`,
          categoryOrPerson: r.money_lent?.person_name || 'Borrower',
          amount: Number(r.amount || 0),
          isPositive: true,
          note: r.note || '',
        });
      });

      monthBorrowed.forEach((b: any) => {
        transactions.push({
          date: b.borrowed_date || (b.created_at || '').slice(0, 10),
          type: 'BORROWED',
          title: `Borrowed from ${b.person_name}`,
          categoryOrPerson: b.person_name,
          amount: Number(b.amount || 0),
          isPositive: false,
          note: b.note || '',
        });
      });

      monthBorrowedRepayments.forEach((r: any) => {
        transactions.push({
          date: r.repayment_date || (r.created_at || '').slice(0, 10),
          type: 'REPAYMENT',
          title: `Repaid to ${r.borrowed_money?.person_name || 'Lender'}`,
          categoryOrPerson: r.borrowed_money?.person_name || 'Lender',
          amount: Number(r.amount || 0),
          isPositive: false,
          note: r.note || '',
        });
      });

      transactions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      // Assembled Report Data
      const reportData: MonthlyReportData = {
        month,
        monthName,
        year,
        generatedAt: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        userEmail: user.email || 'user@savewell.app',
        totalIncome,
        totalSaved,
        savingsRate,
        totalMoneyLent,
        totalMoneyReceivedBack,
        totalMoneyBorrowed,
        totalRepaymentsMade,
        currentOutstandingMoneyIOwe,
        budgetTarget,
        budgetAchieved,
        budgetPercentage,
        goalContributions: goalLinkedSavings,
        savingsCount,
        highestSaving,
        goalLinkedSavings,
        categoriesBreakdown,
        incomeBreakdown,
        budgetsList,
        goalsList,
        moneyLentList,
        moneyIOweList,
        transactions,
      };

      if (mode === 'preview') {
        openPrintableMonthlyReport(reportData);
        setSuccessMsg(`Monthly report for ${monthName} ${year} opened in browser print preview.`);
      } else {
        const blob = generateMonthlyReportPdf(reportData);
        const filename = `SaveWell_Monthly_Report_${monthName}_${year}.pdf`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSuccessMsg(`Successfully downloaded ${filename}`);
      }
    } catch (err: any) {
      console.error('PDF Generation error:', err);
      setError(err?.message || 'Failed to generate monthly PDF report.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal title="Export Monthly Report as PDF" eyebrow="Financial Report" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Generate an authenticated SaveWell monthly PDF financial report using your real data. Includes savings breakdown, budgets, goal achievements, lending, liabilities, and itemized transaction history.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Month</span>
            <select
              className="h-12 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-accent"
              value={month}
              onChange={(e) => { setMonth(Number(e.target.value)); setError(''); setSuccessMsg(''); }}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>
          </label>
          <Field
            label="Year"
            type="number"
            min="2020"
            max="2035"
            required
            value={year}
            onChange={(e: any) => { setYear(Number(e.target.value)); setError(''); setSuccessMsg(''); }}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="rounded-xl border border-[#39715c]/30 bg-[#39715c]/10 p-3.5 text-xs font-semibold text-[#39715c] flex items-center gap-2">
            <Check size={16} />
            {successMsg}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <Button
            disabled={generating}
            variant="primary"
            className="flex-1 h-12 text-sm font-bold"
            onClick={() => handleGenerate('download')}
          >
            {generating ? <Loader2 className="animate-spin" size={17} /> : <FileText size={17} />}
            {generating ? 'Generating PDF...' : 'Download PDF Report'}
          </Button>

          <Button
            disabled={generating}
            variant="outline"
            className="h-12 text-sm font-semibold"
            onClick={() => handleGenerate('preview')}
          >
            <Printer size={16} /> Print / Preview
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Savings & Transactions Activity Page (Unified History with Filters & Pagination)
// ---------------------------------------------------------------------------
function ActivityPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'savings' | 'lent' | 'borrowed'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedSaving, setSelectedSaving] = useState<any>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);

  const PAGE_SIZE = 20;

  // 1. Fetch Savings
  const savingsQuery = useQuery({
    queryKey: ['savings', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('savings')
        .select('*, categories(*), goals(*)')
        .eq('user_id', user.id)
        .order('saving_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // 2. Fetch Categories
  const categoriesQuery = useQuery({
    queryKey: ['categories', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
  });

  // 3. Fetch Money Lent & Repayments
  const moneyLentQuery = useQuery({
    queryKey: ['money_lent', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('money_lent').select('*').eq('user_id', user.id);
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  const lentRepaymentsQuery = useQuery({
    queryKey: ['money_lent_repayments', 'all', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('money_lent_repayments').select('*, money_lent(*)').eq('user_id', user.id);
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  // 4. Fetch Borrowed Money & Borrowed Repayments
  const borrowedQuery = useQuery({
    queryKey: ['borrowed_money', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('borrowed_money').select('*').eq('user_id', user.id);
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  const borrowedRepaymentsQuery = useQuery({
    queryKey: ['borrowed_money_repayments', 'all', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('borrowed_money_repayments').select('*, borrowed_money(*)').eq('user_id', user.id);
      if (error) {
        if (isSchemaCacheError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });

  const savings = savingsQuery.data || [];
  const categories = categoriesQuery.data || [];
  const moneyLent = moneyLentQuery.data || [];
  const lentRepayments = lentRepaymentsQuery.data || [];
  const borrowedMoney = borrowedQuery.data || [];
  const borrowedRepayments = borrowedRepaymentsQuery.data || [];

  // Build Unified Activity List with Strict Financial Separation & Badges
  const unifiedActivities = useMemo(() => {
    const list: any[] = [];

    // 1. Savings Deposits
    savings.forEach((s: any) => {
      list.push({
        id: `saving-${s.id}`,
        rawId: s.id,
        type: 'SAVINGS',
        title: s.categories?.name || 'Deposit',
        subtitle: s.is_goal_linked && s.goals?.name ? `For ${s.goals.name}` : s.note || 'Flexible deposit',
        date: s.saving_date || s.date || (s.created_at || '').slice(0, 10),
        amount: Number(s.amount || 0),
        isPositive: true,
        icon: s.categories?.icon || '💰',
        badgeColor: 'bg-[#39715c]/15 text-[#39715c]',
        raw: s,
      });
    });

    // 2. Money Lent
    moneyLent.forEach((l: any) => {
      list.push({
        id: `lent-${l.id}`,
        rawId: l.id,
        type: 'LENT',
        title: `Lent to ${l.person_name}`,
        subtitle: l.note || (l.due_date ? `Due ${dateLabel(l.due_date)}` : 'Loan issued'),
        date: l.lent_date || (l.created_at || '').slice(0, 10),
        amount: Number(l.amount || 0),
        isPositive: false,
        icon: '🤝',
        badgeColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
        raw: l,
      });
    });

    // 3. Money Lent Repayments (Received back)
    lentRepayments.forEach((r: any) => {
      list.push({
        id: `lent-rep-${r.id}`,
        rawId: r.id,
        type: 'RECEIVED',
        title: `Repayment from ${r.money_lent?.person_name || 'Borrower'}`,
        subtitle: r.note || 'Lent money returned',
        date: r.repayment_date || (r.created_at || '').slice(0, 10),
        amount: Number(r.amount || 0),
        isPositive: true,
        icon: '💵',
        badgeColor: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        raw: r,
      });
    });

    // 4. Borrowed Money (Money I Owe liability)
    borrowedMoney.forEach((b: any) => {
      list.push({
        id: `borrowed-${b.id}`,
        rawId: b.id,
        type: 'BORROWED',
        title: `Borrowed from ${b.person_name}`,
        subtitle: b.note || (b.due_date ? `Due ${dateLabel(b.due_date)}` : 'Liability recorded'),
        date: b.borrowed_date || (b.created_at || '').slice(0, 10),
        amount: Number(b.amount || 0),
        isPositive: false,
        icon: '📋',
        badgeColor: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
        raw: b,
      });
    });

    // 5. Borrowed Money Repayments (Repayment made by user)
    borrowedRepayments.forEach((r: any) => {
      list.push({
        id: `borrowed-rep-${r.id}`,
        rawId: r.id,
        type: 'REPAYMENT',
        title: `Repayment to ${r.borrowed_money?.person_name || 'Lender'}`,
        subtitle: r.note || 'Liability repaid',
        date: r.repayment_date || (r.created_at || '').slice(0, 10),
        amount: Number(r.amount || 0),
        isPositive: false,
        icon: '💳',
        badgeColor: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
        raw: r,
      });
    });

    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [savings, moneyLent, lentRepayments, borrowedMoney, borrowedRepayments]);

  const filtered = useMemo(() => {
    return unifiedActivities.filter((item: any) => {
      const q = search.toLowerCase();
      const matchesSearch = (
        (item.title || '').toLowerCase().includes(q) ||
        (item.subtitle || '').toLowerCase().includes(q)
      );
      if (!matchesSearch) return false;

      if (typeFilter === 'savings' && item.type !== 'SAVINGS') return false;
      if (typeFilter === 'lent' && item.type !== 'LENT' && item.type !== 'RECEIVED') return false;
      if (typeFilter === 'borrowed' && item.type !== 'BORROWED' && item.type !== 'REPAYMENT') return false;

      if (typeFilter === 'savings' && categoryFilter !== 'all' && item.raw?.category_id !== categoryFilter) {
        return false;
      }

      return true;
    });
  }, [unifiedActivities, search, typeFilter, categoryFilter]);

  const paginatedActivities = useMemo(() => {
    return filtered.slice(0, page * PAGE_SIZE);
  }, [filtered, page]);

  const deleteSaving = async (s: any) => {
    if (window.confirm(`Delete deposit entry of ${formatINR(s.amount)}?`)) {
      await supabase.from('savings').delete().eq('id', s.id);
      qc.invalidateQueries();
      setSelectedSaving(null);
    }
  };

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">Activity & History</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Transaction History.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Export Monthly Report as PDF Button */}
          <Button
            variant="outline"
            onClick={() => setShowPdfModal(true)}
            className="h-10 text-xs font-semibold whitespace-nowrap"
          >
            <FileText size={15} /> Export Monthly Report as PDF
          </Button>

          {/* Type Filter Tabs */}
          <div className="flex rounded-xl border border-border bg-card p-1">
            {[
              ['all', 'All Activity'],
              ['savings', 'Savings'],
              ['lent', 'Money Lent'],
              ['borrowed', 'Money I Owe'],
            ].map(([t, label]) => (
              <button
                key={t}
                onClick={() => { setTypeFilter(t as any); setPage(1); }}
                className={`touch-target rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                  typeFilter === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {typeFilter === 'savings' && categories.length > 0 && (
            <select
              className="h-10 rounded-xl border border-input bg-card px-3 text-xs outline-none focus:border-accent"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            >
              <option value="all">All Categories</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          )}

          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
            <input
              type="search"
              className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-accent"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search history..."
            />
          </div>
        </div>
      </div>

      {savingsQuery.isLoading ? (
        <LoadingSkeleton />
      ) : paginatedActivities.length ? (
        <div className="grid gap-2.5">
          {paginatedActivities.map((act: any) => (
            <div
              key={act.id}
              onClick={() => {
                if (act.type === 'SAVINGS') setSelectedSaving(act.raw);
              }}
              className={`touch-target flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition ${
                act.type === 'SAVINGS' ? 'hover:bg-muted/50 cursor-pointer active:scale-[0.99]' : ''
              }`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-lg">
                {act.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{act.title}</p>
                  <span className={`rounded-full px-2 py-0.5 font-mono-ui text-[9px] font-bold ${act.badgeColor}`}>
                    {act.type}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {act.subtitle} · {dateLabel(act.date)}
                </p>
              </div>
              <p className={`font-mono-ui text-sm sm:text-base font-bold ${act.isPositive ? 'text-[#39715c]' : 'text-[#b86e48]'}`}>
                {act.isPositive ? '+' : '-'}{formatINR(act.amount)}
              </p>
            </div>
          ))}

          {filtered.length > page * PAGE_SIZE && (
            <div className="mt-4 text-center">
              <Button variant="outline" className="w-full sm:w-auto h-12 px-8" onClick={() => setPage(p => p + 1)}>
                Load More
              </Button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          title={search ? 'No matches found' : 'No transaction history recorded yet'}
          body={search ? 'Try searching a different keyword' : 'Your savings, lending, and borrowed money activity will appear here.'}
          icon={CircleDollarSign}
        />
      )}

      {selectedSaving && (
        <TransactionDetailModal
          saving={selectedSaving}
          onClose={() => setSelectedSaving(null)}
          onDelete={deleteSaving}
        />
      )}

      {showPdfModal && (
        <ExportPdfReportModal onClose={() => setShowPdfModal(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings Page (Theme, Export Monthly PDF Report, Account)
// ---------------------------------------------------------------------------
function SettingsPage() {
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('savewell-theme') || 'light');
  const [showPdfModal, setShowPdfModal] = useState(false);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('savewell-theme', next);
  };

  return (
    <>
      <div className="mb-7">
        <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">Preferences</p>
        <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Settings & Profile.</h1>
      </div>

      <div className="grid max-w-3xl gap-5">
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl">Appearance</h2>
              <p className="text-sm text-muted-foreground">Toggle Light & Dark theme</p>
            </div>
            <button className={`touch-target relative h-8 w-14 rounded-full transition ${theme === 'dark' ? 'bg-accent' : 'bg-primary'}`} onClick={toggleTheme} aria-label="Toggle theme">
              <span className={`absolute top-1.5 h-5 w-5 rounded-full bg-card transition-all ${theme === 'dark' ? 'left-7' : 'left-1.5'}`} />
            </button>
          </div>
        </section>

        {/* Replaced CSV Export with Export Monthly Report as PDF */}
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl">Monthly Report</h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">PDF Export</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Export a clean, authenticated SaveWell monthly financial report with full analytics, savings breakdowns, and liability status</p>
            </div>
            <Button variant="primary" onClick={() => setShowPdfModal(true)} className="h-12 whitespace-nowrap">
              <FileText size={17} /> Export Monthly Report as PDF
            </Button>
          </div>
        </section>

        <section className="rounded-3xl border border-destructive/20 bg-destructive/5 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-destructive">Account Sign Out</h2>
              <p className="text-sm text-muted-foreground">Logged in as {user.email}</p>
            </div>
            <Button variant="danger" onClick={signOut} className="h-12">
              <LogOut size={17} /> Sign out
            </Button>
          </div>
        </section>
      </div>

      {showPdfModal && (
        <ExportPdfReportModal onClose={() => setShowPdfModal(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// App Router Configuration
// ---------------------------------------------------------------------------
function AppShellPage({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}

function Router() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={36} />
      </div>
    );
  }

  return (
    <ErrorBoundary resetKey={window.location.pathname}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/sign-in" component={() => <AuthPage mode="sign-in" />} />
        <Route path="/sign-up" component={() => <AuthPage mode="sign-up" />} />
        <Route path="/dashboard" component={() => <AppShellPage><Dashboard /></AppShellPage>} />
        <Route path="/savings" component={() => <AppShellPage><ActivityPage /></AppShellPage>} />
        <Route path="/goals" component={() => <AppShellPage><GoalsPage /></AppShellPage>} />
        <Route path="/budget" component={() => <AppShellPage><BudgetPage /></AppShellPage>} />
        <Route path="/money-lent" component={() => <AppShellPage><MoneyLentPage /></AppShellPage>} />
        <Route path="/borrowed" component={() => <AppShellPage><MoneyIOwePage /></AppShellPage>} />
        <Route path="/money-i-owe" component={() => <Redirect to="/borrowed" />} />
        <Route path="/categories" component={() => <AppShellPage><CategoriesPage /></AppShellPage>} />
        <Route path="/activity" component={() => <AppShellPage><ActivityPage /></AppShellPage>} />
        <Route path="/analytics" component={() => <AppShellPage><AnalyticsPage /></AppShellPage>} />
        <Route path="/settings" component={() => <AppShellPage><SettingsPage /></AppShellPage>} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL ? import.meta.env.BASE_URL.replace(/\/$/, '') : ''}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;