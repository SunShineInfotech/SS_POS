import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  FolderTree,
  Receipt,
  ArrowDownCircle,
  ArrowUpCircle,
  UserCheck,
  Utensils,
  CalendarCheck,
  BarChart3,
  UtensilsCrossed,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  FileText,
  // new icons for better differentiation
  ShoppingBag,
  RotateCcw,
  Wallet,
  HandCoins,
  Trash2,
  FileSpreadsheet,
  Settings,
  Boxes,
  ClipboardList,
  // for the new random section
  Shuffle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export const DesktopSidebar = ({ collapsed, onToggle }: Props) => {
  const location = useLocation();
  const { user } = useAuth();
  const companyData = localStorage.getItem("company_data");
  const franchiseType = companyData ? JSON.parse(companyData)?.franchise_type : null;
  const isRestaurant = user?.role === "restaurant" || franchiseType === 2;

  const navGroups = [
    {
      label: "Main",
      items: [
        { to: "/", icon: LayoutDashboard, label: "Dashboard" },
        ...(isRestaurant
          ? [
              {
                to: "/restaurant-tables",
                icon: UtensilsCrossed,
                label: "Tables",
              },
            ]
          : [{ to: "/pos", icon: ShoppingCart, label: "POS" }]),
      ],
    },
    {
      label: "Transactions",
      items: [
        { to: "/sales", icon: Receipt, label: "Sales" },
        ...(isRestaurant
          ? []
          : [{ to: "/sales-return", icon: RotateCcw, label: "Sales Return" }]),
        { to: "/purchases", icon: ShoppingBag, label: "Purchases" },
        { to: "/purchases-return", icon: RotateCcw, label: "Purchases Return" },
        { to: "/purchases-payment", icon: HandCoins, label: "Purchases payment" },
        { to: "/weastage-product", icon: Trash2, label: "Weastage Product" },
        { to: "/quotaion", icon: FileSpreadsheet, label: "Quotaion" },
      ],
    },
    {
      label: "Masters",
      items: [
        { to: "/categories", icon: FolderTree, label: "Categories" },
        { to: "/products", icon: Package, label: "Products" },
        { to: "/customers", icon: Users, label: "Customers" },
        { to: "/vendors", icon: Truck, label: "Vendors" },
        { to: "/employees", icon: UserCheck, label: "Employees" },
        ...(isRestaurant
          ? [{ to: "/tables", icon: Utensils, label: "Tables" }]
          : []),
      ],
    },
    {
      label: "Finance",
      items: [
        { to: "/expance-category", icon: FolderTree, label: "Expance Category" },
        { to: "/account", icon: Wallet, label: "Account" },
        { to: "/income", icon: ArrowDownCircle, label: "Transaction" },
        { to: "/attendance", icon: CalendarCheck, label: "Attendance" },
      ],
    },
    {
      label: "Reports",
      items: [
        { to: "/reports/inventory", icon: Boxes, label: "Stock Report" },
        { to: "/reports/gst", icon: FileText, label: "GST Report" },
        { to: "/reports/orders", icon: ClipboardList, label: "Order Report" },
        { to: "/reports/transaction-report", icon: FileText, label: "transaction report" },
        { to: "/reports/vendor-payment-reminder", icon: HandCoins, label: "vendor-payment-reminder" },
        { to: "/reports/customer-payment-reminder", icon: HandCoins, label: "customer-payment-reminder" },
        { to: "/reports/sms", icon: FileText, label: "sms" },
      ],
    },
    // ---- NEW "RANDOM" SECTION ----
    {
      label: "Random",
      items: [
        { to: "/settings", icon: Settings, label: "Settings" },
        // add more as needed
      ],
    },
  ];

  return (
    <aside
      className={`hidden md:flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 ${
        collapsed ? "w-[68px]" : "w-60"
      }`}
    >
      <div
        className={`flex h-14 items-center border-b border-sidebar-border ${
          collapsed ? "justify-center px-2" : "justify-between px-4"
        }`}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Layers className="h-4 w-4" />
            </span>
            <span className="font-display text-sm font-bold tracking-tight text-sidebar-accent-foreground truncate">
              Trackdesk
            </span>
          </div>
        )}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="p-1.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto no-scrollbar py-3 px-2 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location.pathname === item.to;
                const link = (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center rounded-md text-sm font-medium transition-colors ${
                      collapsed
                        ? "justify-center h-10 w-10 mx-auto"
                        : "gap-2.5 px-3 py-2"
                    } ${
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                );
                if (!collapsed) return link;
                return (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-sidebar-border p-3">
          <p className="text-[10px] text-sidebar-foreground/50">Version 1.4.0</p>
        </div>
      )}
    </aside>
  );
};