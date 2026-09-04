import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ThemeToggle = ({ variant = "icon" }: { variant?: "icon" | "row" }) => {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const next = () => setTheme(isDark ? "light" : "dark");

  if (variant === "row") {
    return (
      <button
        onClick={next}
        className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted transition-colors"
      >
        <span className="flex items-center gap-3">
          {isDark ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-warning" />}
          <span className="text-sm font-medium">{isDark ? "Dark Mode" : "Light Mode"}</span>
        </span>
        <span className="text-xs text-muted-foreground">Tap to switch</span>
      </button>
    );
  }

  return (
    <Button variant="ghost" size="icon" onClick={next} aria-label="Toggle theme" className="h-9 w-9">
      {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </Button>
  );
};
