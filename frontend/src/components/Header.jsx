import { Button } from "@/components/ui/button";
import { LogOut, User, Sun, Moon, BookOpen } from "lucide-react";
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';

export default function Header() {
  const { authUser, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();

  return (
    <header className="h-12 bg-background border-b border-border flex items-center justify-between px-6 flex-shrink-0">
      {/* Brand Identity */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-xs flex-shrink-0">
          <BookOpen className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-foreground tracking-tight font-semibold text-sm">Chithhi</span>
          <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/60">
            LM
          </span>
        </div>
        <div className="h-3.5 w-px bg-border mx-1 hidden sm:block" />
        <span className="text-xs text-muted-foreground hidden sm:block font-normal">
          Research Workspace
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Theme toggle */}
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

        {/* User info */}
        <div className="flex items-center gap-2 text-xs font-medium text-foreground bg-muted/50 px-2.5 py-1 rounded-lg border border-border/60 hidden sm:flex">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{authUser?.name}</span>
        </div>

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
          title="Sign Out"
        >
          <LogOut className="w-3.5 h-3.5 mr-1.5" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}