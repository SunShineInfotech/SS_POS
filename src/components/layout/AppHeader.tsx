import { useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut, User as UserIcon, Layers, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/pos": "Point of Sale",
  "/restaurant-tables": "Restaurant Tables",
  "/categories": "Categories",
  "/products": "Products",
  "/customers": "Customers",
  "/vendors": "Vendors",
  "/employees": "Employees",
  "/tables": "Tables",
  "/sales": "Sales",
  "/purchases": "Purchases",
  "/income": "Income",
  "/expenses": "Expenses",
  "/attendance": "Attendance",
  "/more": "More",
  "/privacy": "Privacy Policy",
  "/terms": "Terms & Conditions",
};

const notifications = [
  { title: "Low stock: Cooking Oil (1L)", time: "10 min ago" },
  { title: "Payment received — INV-002", time: "1 hr ago" },
  { title: "Vendor bill PUR-102 is due", time: "Yesterday" },
];

export const AppHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const title = pageTitles[location.pathname] || "BizBright";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 md:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <span className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Layers className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-base font-semibold tracking-tight truncate">{title}</h1>
          {user && (
            <p className="text-[11px] text-muted-foreground -mt-0.5 truncate">
              {user.shopName} • {user.role === "restaurant" ? "Restaurant Owner" : "Shop Owner"}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="hidden md:block">
          <ThemeToggle />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground flex items-center justify-center">
                {notifications.length}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="font-display">Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.map((n) => (
              <DropdownMenuItem key={n.title} className="flex-col items-start gap-0.5 py-2">
                <span className="text-xs font-medium">{n.title}</span>
                <span className="text-[10px] text-muted-foreground">{n.time}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold font-display">
                {(user?.username || "U").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden sm:inline text-xs font-medium max-w-[100px] truncate">{user?.username}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="font-display text-sm">{user?.username}</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                {user?.role === "restaurant" ? "Restaurant Owner" : "Shop Owner"} • FY {user?.financialYear || "2025-26"}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/more")} className="gap-2 text-xs">
              <UserIcon className="h-3.5 w-3.5" /> Profile & Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/more")} className="gap-2 text-xs">
              <Settings className="h-3.5 w-3.5" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="gap-2 text-xs text-destructive focus:text-destructive">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
