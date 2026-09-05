import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, BarChart3, Calendar as CalendarIcon, Check, CircleDollarSign,
  CloudDownload, Edit3, Flame, Home, ListFilter, Loader2,
  LogOut, Menu, Moon, Pencil, Plus, Search, Settings,
  Sparkles, Sun, Target, Trash2, TrendingUp, Wallet, X, Zap, Eye, EyeOff, Info, Clock, AlertCircle, WifiOff
} from 'lucide-react';
import React, { useEffect, useMemo, useState, createContext, useContext } from 'react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
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

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning 👋';
  if (hour < 17) return 'Good afternoon 👋';
  return 'Good evening 👋';
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
// Component Helpers
// ---------------------------------------------------------------------------
function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${light ? 'text-[#fbf5e8]' : 'text-foreground'}`}>
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${light ? 'bg-accent text-foreground' : 'bg-primary text-background'}`}>
        <CircleDollarSign size={20} strokeWidth={2.4} />
      </span>
      <span className="font-display text-[22px] leading-none tracking-[-.03em]">savewell</span>
    </Link>
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
      <div className="animate-sheet-up max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-card p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-7">
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

function EmptyState({ title, body, action }: any) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
        <Sparkles size={21} />
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
    <div className="min-h-[100dvh] overflow-hidden">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-10">
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
      <main>
        <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-20">
          <div className="rise-in">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 font-mono-ui text-[10px] uppercase tracking-[.16em] text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-[#72b799]" /> Real-time personal savings tracker
            </div>
            <h1 className="max-w-2xl font-display text-[clamp(3.6rem,8vw,7.2rem)] leading-[.93] tracking-[-.07em]">
              Small steps.<br /><span className="text-[#b86e48]">Real somewhere.</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-muted-foreground">
              Savewell turns the money you set aside into a clear, encouraging picture of what you’re building in real-time.
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
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[440px] rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-background shadow-md">
            <CircleDollarSign size={28} strokeWidth={2.4} />
          </div>
          <h1 className="mt-4 font-display text-3xl tracking-tight">
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
    { href: '/categories', label: 'Categories', icon: Wallet },
    { href: '/goals', label: 'Goals', icon: Target },
    { href: '/activity', label: 'Activity', icon: CircleDollarSign },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
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
        <div className="mt-10 flex-1 space-y-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`touch-target flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition ${location === href ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}
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
            <Brand />
          </div>
          <div className="hidden md:block">
            <p className="font-mono-ui text-[10px] uppercase tracking-[.17em] text-muted-foreground">Personal Savings Tracker</p>
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

        {/* Mobile Bottom Navigation Bar (Strict Prompt Requirement #5 & #6) */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 border-t border-border/80 bg-background/95 backdrop-blur-xl md:hidden safe-area-bottom shadow-lg">
          {links.map(({ href, label, icon: Icon }) => {
            const isActive = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-all ${
                  isActive
                    ? 'text-primary font-bold scale-105'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={20} className={isActive ? 'text-primary' : ''} />
                <span>{label}</span>
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
  const [isGoalLinked, setIsGoalLinked] = useState(false); // Goal linking is optional
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

        {/* Category Selection (Source of Saving) */}
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

        {/* Goal Link Options (Purpose of Saving - Optional) */}
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
// Dashboard View (Mobile Hierarchy strictly matching Prompt Section #2)
// ---------------------------------------------------------------------------
function Dashboard() {
  const { user } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedSaving, setSelectedSaving] = useState<any>(null);

  // 1. Fetch User Categories from Supabase PostgreSQL (NO auto-seeding)
  const categoriesQuery = useQuery({
    queryKey: ['categories', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // 2. Fetch User Goals from Supabase PostgreSQL
  const goalsQuery = useQuery({
    queryKey: ['goals', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*').eq('user_id', user.id).order('is_main', { ascending: false }).order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // 3. Fetch User Savings Transactions from Supabase PostgreSQL
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

  const qc = useQueryClient();
  const isLoading = categoriesQuery.isLoading || goalsQuery.isLoading || savingsQuery.isLoading;

  const categories = categoriesQuery.data || [];
  const goals = goalsQuery.data || [];
  const savings = savingsQuery.data || [];

  // Goal saved amount = starting_amount + SUM(savings where is_goal_linked = true and goal_id = goal.id)
  const goalsWithCalculatedAmounts = useMemo(() => {
    return goals.map((g: any) => {
      const targetAmt = g.target_amount != null ? Number(g.target_amount) : Number(g.target_paise || 0) / 100;
      const startingAmt = g.starting_amount != null ? Number(g.starting_amount) : Number(g.starting_paise || 0) / 100;
      const linkedDeposits = savings
        .filter((s: any) => s.goal_id === g.id && s.is_goal_linked !== false)
        .reduce((sum: number, s: any) => sum + (s.amount != null ? Number(s.amount) : Number(s.amount_paise || 0) / 100), 0);
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
      const total = catSavings.reduce((sum: number, s: any) => sum + (s.amount != null ? Number(s.amount) : Number(s.amount_paise || 0) / 100), 0);
      return {
        ...c,
        total_amount: total,
        entry_count: catSavings.length,
      };
    });
  }, [categories, savings]);

  // Today, This Month, Total Saved
  const today = todayStr();
  const currentMonthPrefix = today.slice(0, 7);

  const todayTotal = savings.filter((s: any) => (s.saving_date || s.date) === today).reduce((sum: number, s: any) => sum + (s.amount != null ? Number(s.amount) : Number(s.amount_paise || 0) / 100), 0);
  const monthTotal = savings.filter((s: any) => (s.saving_date || s.date || '').startsWith(currentMonthPrefix)).reduce((sum: number, s: any) => sum + (s.amount != null ? Number(s.amount) : Number(s.amount_paise || 0) / 100), 0);
  const totalSaved = savings.reduce((sum: number, s: any) => sum + (s.amount != null ? Number(s.amount) : Number(s.amount_paise || 0) / 100), 0);

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

  const deleteSavingFromDetail = async (s: any) => {
    if (window.confirm(`Delete saving entry of ${formatINR(s.amount)}?`)) {
      await supabase.from('savings').delete().eq('id', s.id);
      qc.invalidateQueries();
      setSelectedSaving(null);
    }
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

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const mainGoalSaved = activeMainGoal?.saved_amount || 0;
  const mainGoalTarget = activeMainGoal?.target_amount || 0;
  const mainGoalPercentage = pct(mainGoalSaved, mainGoalTarget);
  const mainGoalRemaining = Math.max(0, mainGoalTarget - mainGoalSaved);

  return (
    <>
      {/* 1. Greeting Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl tracking-tight">
          {getGreeting()}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground font-medium">
          {user.user_metadata?.full_name || user.email?.split('@')[0]}
        </p>
      </div>

      {/* 2. MAIN GOAL CARD */}
      <div className="grid gap-6">
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
            body="Set your primary goal (e.g. Laptop, Emergency Fund) to track real-time progress."
            action={
              <Link href="/goals" className="touch-target inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
                Create a goal <ArrowRight size={16} className="ml-1" />
              </Link>
            }
          />
        )}

        {/* 3. [ + Add Saving ] Action Button */}
        <Button onClick={() => setShowAddModal(true)} className="h-14 text-base font-bold shadow-md w-full">
          <Plus size={20} /> + Add Saving
        </Button>

        {/* 4. Today & This Month Summary Cards */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today</p>
            <p className="mt-3 font-mono-ui text-xl sm:text-2xl font-bold text-foreground">{formatINR(todayTotal)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">This Month</p>
            <p className="mt-3 font-mono-ui text-xl sm:text-2xl font-bold text-foreground">{formatINR(monthTotal)}</p>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Saved</p>
            <p className="mt-3 font-mono-ui text-xl sm:text-2xl font-bold text-foreground">{formatINR(totalSaved)}</p>
          </div>
        </div>

        {/* 5. Streak Card */}
        <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f7dfc9] text-[#a35e3e] text-xl">
              🔥
            </span>
            <div>
              <p className="font-display text-xl sm:text-2xl font-bold">{streak} {streak === 1 ? 'day' : 'days'} streak</p>
              <p className="text-xs text-muted-foreground">Keep recording savings daily</p>
            </div>
          </div>
          <span className="font-mono-ui text-xs font-semibold text-[#39715c] bg-secondary px-3 py-1.5 rounded-full">
            Active
          </span>
        </div>

        {/* 6. Money Sources & 7. Recent Savings */}
        <div className="mt-2 grid gap-8 lg:grid-cols-[1fr_.8fr]">
          {/* Recent Savings */}
          <section>
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="font-display text-2xl">Recent Savings</h2>
              <Link href="/activity" className="touch-target text-xs font-semibold text-muted-foreground hover:text-foreground">
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
                    <p className="font-mono-ui text-sm sm:text-base font-bold text-[#39715c]">+{formatINR(s.amount != null ? s.amount : (s.amount_paise || 0) / 100)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No savings recorded yet"
                body="Record your first deposit and watch your savings goal move closer."
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
              <h2 className="font-display text-2xl">Money Sources</h2>
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

      {selectedSaving && (
        <TransactionDetailModal
          saving={selectedSaving}
          onClose={() => setSelectedSaving(null)}
          onDelete={deleteSavingFromDetail}
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
      const totalAmount = catSavings.reduce((sum: number, s: any) => sum + (s.amount != null ? Number(s.amount) : Number(s.amount_paise || 0) / 100), 0);
      const goalLinkedAmount = catSavings
        .filter((s: any) => s.is_goal_linked && s.goal_id)
        .reduce((sum: number, s: any) => sum + (s.amount != null ? Number(s.amount) : Number(s.amount_paise || 0) / 100), 0);
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
      if (error) {
        console.error('Update category error:', error);
        throw new Error(error.message || 'Failed to update category.');
      }
    } else {
      const { error } = await supabase.from('categories').insert(payload);
      if (error) {
        console.error('Insert category error:', error);
        throw new Error(error.message || 'Failed to create category.');
      }
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
    if (!user?.id) {
      throw new Error('Authentication required to save a goal.');
    }

    const trimmedName = form.name?.trim();
    if (!trimmedName) {
      throw new Error('Goal name is required.');
    }

    const targetAmount = Number(form.target_amount);
    if (!targetAmount || isNaN(targetAmount) || targetAmount <= 0) {
      throw new Error('Target amount must be a positive number greater than ₹0.');
    }

    const startingAmount = Number(form.starting_amount || 0);
    if (isNaN(startingAmount) || startingAmount < 0) {
      throw new Error('Already saved amount must be ₹0 or greater.');
    }

    const isMain = Boolean(form.is_main);
    if (isMain) {
      const { error: resetErr } = await supabase.from('goals').update({ is_main: false }).eq('user_id', user.id);
      if (resetErr) {
        console.error('Reset main goal error:', resetErr);
      }
    }

    const targetPaise = Math.round(targetAmount * 100);
    const startingPaise = Math.round(startingAmount * 100);

    const payload = {
      user_id: user.id,
      name: trimmedName,
      icon: form.icon || '🎯',
      target_amount: targetAmount,
      target_paise: targetPaise,
      starting_amount: startingAmount,
      starting_paise: startingPaise,
      target_date: form.target_date?.trim() || null,
      description: form.description?.trim() || null,
      is_main: goals.length === 0 || isMain,
    };

    if (modal?.goal?.id) {
      const { data, error } = await supabase.from('goals').update(payload).eq('id', modal.goal.id).select();
      if (error) {
        console.error('Update goal error:', error);
        throw new Error(error.message || 'Failed to update goal.');
      }
    } else {
      const { data, error } = await supabase.from('goals').insert(payload).select();
      if (error) {
        console.error('Insert goal error:', error);
        throw new Error(error.message || 'Failed to create goal.');
      }
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
    if (isNaN(startingNum) || startingNum < 0) {
      setError('Already saved amount must be ₹0 or greater.');
      return;
    }

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
      setError(err?.message || 'Failed to save goal. Please try again.');
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
// Activity View (Savings History with Pagination, Detail Sheet)
// ---------------------------------------------------------------------------
function ActivityPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedSaving, setSelectedSaving] = useState<any>(null);

  const PAGE_SIZE = 20;

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

  const savings = savingsQuery.data || [];

  const filtered = useMemo(() => {
    return savings.filter((s: any) => {
      const q = search.toLowerCase();
      return (
        (s.categories?.name || '').toLowerCase().includes(q) ||
        (s.goals?.name || '').toLowerCase().includes(q) ||
        (s.note || '').toLowerCase().includes(q)
      );
    });
  }, [savings, search]);

  const paginatedSavings = useMemo(() => {
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
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">History</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Savings Activity.</h1>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3.5 top-3.5 text-muted-foreground" size={18} />
          <input
            type="search"
            className="h-12 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-base outline-none focus:border-accent"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search history..."
          />
        </div>
      </div>

      {savingsQuery.isLoading ? (
        <LoadingSkeleton />
      ) : paginatedSavings.length ? (
        <div className="grid gap-2.5">
          {paginatedSavings.map((s: any) => (
            <div
              key={s.id}
              onClick={() => setSelectedSaving(s)}
              className="touch-target flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:bg-muted/50 cursor-pointer active:scale-[0.99]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-lg">
                {s.categories?.icon || '💰'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.categories?.name || 'Deposit'}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {s.is_goal_linked && s.goals?.name ? `For ${s.goals.name}` : s.note || 'Flexible deposit'} · {dateLabel(s.saving_date)}
                </p>
              </div>
              <p className="font-mono-ui text-sm sm:text-base font-bold text-[#39715c]">+{formatINR(s.amount)}</p>
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
          title={search ? 'No matches found' : 'No transactions recorded'}
          body={search ? 'Try searching a different keyword' : 'Your savings activity history will appear here once you add deposits.'}
        />
      )}

      {selectedSaving && (
        <TransactionDetailModal
          saving={selectedSaving}
          onClose={() => setSelectedSaving(null)}
          onDelete={deleteSaving}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Analytics View (Charts, Smart Goal Prediction, Real Data Only)
// ---------------------------------------------------------------------------
function AnalyticsPage() {
  const { user } = useAuth();
  const [range, setRange] = useState('30d');

  const savingsQuery = useQuery({
    queryKey: ['savings', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('savings').select('*, categories(*), goals(*)').eq('user_id', user.id);
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
  const goals = goalsQuery.data || [];

  const mainGoal = goals.find((g: any) => g.is_main) || goals[0] || null;

  // Filter savings by selected range
  const filteredSavings = useMemo(() => {
    let days = 30;
    if (range === '7d') days = 7;
    if (range === '30d') days = 30;
    if (range === '3m') days = 90;
    if (range === '1y') days = 365;
    if (range === 'all') days = 9999;

    const start = new Date();
    start.setDate(start.getDate() - days);
    const startStr = start.toISOString().slice(0, 10);

    return savings.filter((s: any) => (s.saving_date || '') >= startStr);
  }, [savings, range]);

  const totalRangeSaved = filteredSavings.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
  const avgSaving = filteredSavings.length > 0 ? Math.round(totalRangeSaved / filteredSavings.length) : 0;

  // Daily Bar Chart Data
  const dailyBarMap = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSavings.forEach((s: any) => {
      const d = (s.saving_date || '').slice(0, 10);
      if (d) map[d] = (map[d] || 0) + Number(s.amount || 0);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredSavings]);

  // Smart Goal Prediction Calculation
  const prediction = useMemo(() => {
    if (!mainGoal) return null;

    const linkedDeposits = savings
      .filter((s: any) => s.goal_id === mainGoal.id && s.is_goal_linked !== false)
      .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
    const currentSaved = Number(mainGoal.starting_amount || 0) + linkedDeposits;
    const remaining = Math.max(0, Number(mainGoal.target_amount) - currentSaved);

    if (remaining === 0) return { completed: true };

    const distinctDays = new Set(savings.map((s: any) => s.saving_date)).size || 1;
    const allTimeSaved = savings.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
    const currentDailyPace = allTimeSaved > 0 ? Math.round(allTimeSaved / distinctDays) : 0;

    let requiredPace = 0;
    let daysLeft = 0;

    if (mainGoal.target_date) {
      const targetD = new Date(mainGoal.target_date);
      const now = new Date();
      daysLeft = Math.max(1, Math.ceil((targetD.getTime() - now.getTime()) / (1000 * 3600 * 24)));
      requiredPace = Math.ceil(remaining / daysLeft);
    }

    const estimatedDaysToFinish = currentDailyPace > 0 ? Math.ceil(remaining / currentDailyPace) : null;
    const estimatedCompletionDate = estimatedDaysToFinish ? new Date(Date.now() + estimatedDaysToFinish * 24 * 3600 * 1000) : null;

    return {
      completed: false,
      remaining,
      daysLeft,
      requiredPace,
      currentDailyPace,
      estimatedCompletionDate,
    };
  }, [mainGoal, savings]);

  if (savings.length === 0) {
    return (
      <>
        <div className="mb-7">
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">Analytics</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Your Saving Shape.</h1>
        </div>
        <EmptyState
          title="Not enough savings data yet"
          body="Keep adding your daily savings to unlock trends, real bar charts, and smart goal predictions."
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold">Analytics</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight">Your Saving Shape.</h1>
        </div>
        <div className="flex rounded-xl border border-border bg-card p-1 overflow-x-auto max-w-full">
          {[
            ['7d', '7 Days'],
            ['30d', '30 Days'],
            ['3m', '3 Months'],
            ['1y', '1 Year'],
            ['all', 'All Time']
          ].map(([v, l]) => (
            <button
              key={v}
              className={`touch-target rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap ${range === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              onClick={() => setRange(v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-primary p-5 text-primary-foreground">
          <p className="text-sm text-primary-foreground/70 font-semibold">Saved in Range</p>
          <p className="mt-4 font-display text-4xl font-bold">{formatINR(totalRangeSaved)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground font-semibold">Average Deposit</p>
          <p className="mt-4 font-mono-ui text-3xl font-bold">{formatINR(avgSaving)}</p>
        </div>
        {prediction && !prediction.completed && (
          <div className="rounded-2xl border border-border bg-[#e4efe7] p-5">
            <p className="text-sm text-muted-foreground font-semibold">Required Daily Pace</p>
            <p className="mt-4 font-display text-3xl font-bold">{prediction.requiredPace ? `${formatINR(prediction.requiredPace)}/day` : 'Set target date'}</p>
          </div>
        )}
      </div>

      {/* Smart Goal Prediction Box */}
      {prediction && !prediction.completed && (
        <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-xs">
          <div className="flex items-center gap-2 font-display text-2xl mb-2">
            <Clock className="text-[#39715c]" size={22} /> Smart Goal Prediction
          </div>
          <p className="text-sm text-muted-foreground">
            Based on your actual historical average deposit pace of <b>{formatINR(prediction.currentDailyPace)}/day</b>:
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground font-semibold">Remaining Amount</p>
              <p className="mt-1 font-mono-ui text-xl font-bold">{formatINR(prediction.remaining)}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground font-semibold">Estimated Target Completion</p>
              <p className="mt-1 font-mono-ui text-xl font-bold">
                {prediction.estimatedCompletionDate ? dateLabel(prediction.estimatedCompletionDate.toISOString()) : 'Keep saving'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Daily Movement Bar Chart */}
      <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-xs">
        <h2 className="font-display text-2xl mb-4">Daily Movement (Real Data Bar Chart)</h2>
        {dailyBarMap.length > 0 ? (
          <div className="mt-6 flex h-60 items-end gap-2 border-b border-border pb-2 overflow-x-auto">
            {dailyBarMap.map(([date, total]) => {
              const max = Math.max(...dailyBarMap.map(([, amt]) => amt), 1);
              const height = Math.max(12, (total / max) * 90);
              return (
                <div key={date} className="group relative flex flex-1 min-w-[28px] flex-col justify-end items-center gap-1">
                  <div className="absolute -top-10 hidden group-hover:flex z-30 whitespace-nowrap rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-lg">
                    {shortDate(date)} · {formatINR(total)}
                  </div>
                  <div className="w-full rounded-t-md bg-[#4d846c] transition-all hover:bg-accent cursor-pointer" style={{ height: `${height}%` }} />
                  <span className="truncate text-[10px] font-mono-ui text-muted-foreground">{shortDate(date)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground p-6 text-center">No deposit entries in this date range.</p>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings Page (Theme, Export Data, Account)
// ---------------------------------------------------------------------------
function SettingsPage() {
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('savewell-theme') || 'light');

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('savewell-theme', next);
  };

  const exportData = async () => {
    const [catRes, goalRes, savRes] = await Promise.all([
      supabase.from('categories').select('*').eq('user_id', user.id),
      supabase.from('goals').select('*').eq('user_id', user.id),
      supabase.from('savings').select('*').eq('user_id', user.id),
    ]);

    const payload = {
      exported_at: new Date().toISOString(),
      user_email: user.email,
      categories: catRes.data || [],
      goals: goalRes.data || [],
      savings: savRes.data || [],
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `savewell-export-${user.email}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl">Export Data</h2>
              <p className="text-sm text-muted-foreground">Download a copy of your real personal savings records</p>
            </div>
            <Button variant="outline" onClick={exportData} className="h-12">
              <CloudDownload size={17} /> Export JSON
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
        <Route path="/goals" component={() => <AppShellPage><GoalsPage /></AppShellPage>} />
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