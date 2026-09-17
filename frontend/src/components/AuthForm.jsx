import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sun, Moon } from "lucide-react";
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useNavigate } from 'react-router-dom';

export default function AuthForm() {
  const { login, register, isLoading } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' });

  const handleLogin = async (e) => {
    e.preventDefault();
    const result = await login(loginForm);
    if (result.success) {
      navigate('/workspace', { replace: true });
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const result = await register(registerForm);
    if (result.success) {
      navigate('/workspace', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal top bar */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-border">
        <a
          href="/"
          className="text-label text-muted-foreground tracking-widest hover:text-foreground px-2.5 py-1 rounded-md hover:bg-muted/60 transition-colors"
          style={{ fontSize: '11px' }}
        >
          ← BACK
        </a>
        <a href="/" className="flex items-center gap-2 group">
          <img
            src="/logo.png"
            alt="Chithhi LM Logo"
            className="w-6 h-6 object-contain drop-shadow-xs dark:drop-shadow-[0_2px_6px_rgba(255,255,255,0.15)] group-hover:scale-105 transition-transform duration-200 flex-shrink-0"
          />
          <span className="text-foreground tracking-tight font-semibold text-sm">Chithhi</span>
          <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/60">
            LM
          </span>
        </a>
        <button
          onClick={toggleTheme}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors rounded-lg cursor-pointer"
          aria-label="Toggle theme"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </nav>

      {/* Auth form */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md animate-fade-in-up p-8 border border-border/80 bg-card rounded-xl shadow-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-3">
              <img
                src="/logo.png"
                alt="Chithhi LM"
                className="w-12 h-12 object-contain drop-shadow-sm dark:drop-shadow-[0_3px_12px_rgba(255,255,255,0.18)] select-none hover:scale-105 transition-transform duration-200"
              />
            </div>
            <p className="text-label mb-2" style={{ color: 'var(--accent)', fontSize: '11px', letterSpacing: '0.12em' }}>
              {mode === 'login' ? 'ACCESS CREDENTIALS' : 'CREATE IDENTITY'}
            </p>
            <h2 className="text-display text-foreground">
              {mode === 'login' ? 'Sign In' : 'Register'}
            </h2>
          </div>

          {/* Login Form */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="login-email" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Email Address
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  required
                  className="h-11 px-3.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-2 focus:ring-foreground/10 transition-all outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Password
                </Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  required
                  className="h-11 px-3.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-2 focus:ring-foreground/10 transition-all outline-none"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full mt-6 text-sm font-medium tracking-wide shadow-sm"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          )}

          {/* Register Form */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="register-name" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Display Name
                </Label>
                <Input
                  id="register-name"
                  type="text"
                  placeholder="Your Name"
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  required
                  className="h-11 px-3.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-2 focus:ring-foreground/10 transition-all outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="register-email" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Email Address
                </Label>
                <Input
                  id="register-email"
                  type="email"
                  placeholder="you@example.com"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  required
                  className="h-11 px-3.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-2 focus:ring-foreground/10 transition-all outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="register-password" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Password
                </Label>
                <Input
                  id="register-password"
                  type="password"
                  placeholder="••••••••"
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                  required
                  className="h-11 px-3.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-2 focus:ring-foreground/10 transition-all outline-none"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full mt-6 text-sm font-medium tracking-wide shadow-sm"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>
          )}

          {/* Toggle */}
          <div className="text-center mt-6 pt-4 border-t border-border/50">
            <p className="text-sm text-muted-foreground">
              {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
              <button
                type="button"
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="ml-2 text-foreground hover:underline underline-offset-4 transition-colors font-semibold cursor-pointer"
              >
                {mode === 'login' ? 'Register' : 'Sign In'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}