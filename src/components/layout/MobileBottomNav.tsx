import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, ShoppingCart, Truck, MoreHorizontal, UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export const MobileBottomNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isRestaurant = user?.role === "restaurant";

  const centerItem = isRestaurant
    ? { to: "/restaurant-tables", icon: UtensilsCrossed, label: "Tables" }
    : { to: "/pos", icon: ShoppingCart, label: "POS" };

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Home" },
    { to: "/customers", icon: Users, label: "Customer" },
    centerItem,
    { to: "/vendors", icon: Truck, label: "Vendor" },
    { to: "/more", icon: MoreHorizontal, label: "More" },
  ];

  return (
    <nav
      className="md:hidden fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-full bg-card/95 backdrop-blur px-2 py-1.5 shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.45)] border border-border"
      style={{ bottom: "15px" }}
    >
      {navItems.map((item, idx) => {
        const isActive = location.pathname === item.to;
        const isCenter = idx === 2;

        if (isCenter) {
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              className={`-mt-6 flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-transform active:scale-95 ${
                isActive ? "ring-2 ring-primary/40" : ""
              }`}
              style={{ background: "var(--gradient-primary)" }}
            >
              <item.icon className="h-6 w-6" />
            </Link>
          );
        }

        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-full text-[10px] font-medium transition-all ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <item.icon className="h-5 w-5" />
            <span className="leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
