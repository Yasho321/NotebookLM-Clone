import { Button } from "@/components/ui/button";
import { Brain, LogOut, User } from "lucide-react";
import { useAuthStore } from '../stores/authStore';

export default function Header() {
  const { authUser, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6">
      <div className="flex items-center space-x-3">
        <Brain className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Chithhi LM</h1>
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 text-sm">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground">{authUser?.name}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="hover:bg-destructive hover:text-destructive-foreground"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>
    </header>
  );
}