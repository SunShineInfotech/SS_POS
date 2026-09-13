import { Link, useNavigate } from "react-router-dom";
import {
  User,
  LogOut,
  FolderTree,
  Package,
  Truck,
  UserCheck,
  Grid3X3,
  CalendarCheck,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  BarChart3,
  ChevronRight,
  UtensilsCrossed,
  Users,
  ShieldCheck,
  FileText,
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  Linkedin,
  Mail,
  Phone,
  // New icons for missing pages
  Wallet,
  HandCoins,
  Trash2,
  FileSpreadsheet,
  ClipboardList,
  Boxes,
  Settings,
  RotateCcw,
  ShoppingBag,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";

const APP_VERSION = "1.4.0 (build 240)";

const socials = [
  { label: "Facebook", icon: Facebook, url: "https://facebook.com" },
  { label: "Instagram", icon: Instagram, url: "https://instagram.com" },
  { label: "X (Twitter)", icon: Twitter, url: "https://twitter.com" },
  { label: "YouTube", icon: Youtube, url: "https://youtube.com" },
  { label: "LinkedIn", icon: Linkedin, url: "https://linkedin.com" },
];

const MoreMenu = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isRestaurant = user?.role === "restaurant";

  const handleLogout = () => {
    logout();
    toast.success("Logged out");
    navigate("/login");
  };

  const menuGroups = [
    // ---- Operations (Main) ----
    {
      label: "Operations",
      items: isRestaurant
        ? [{ to: "/restaurant-tables", icon: UtensilsCrossed, label: "Tables" }]
        : [{ to: "/tables", icon: Grid3X3, label: "Tables" }],
    },
    // ---- Transactions (new) ----
    {
      label: "Transactions",
      items: [
        { to: "/sales", icon: Receipt, label: "Sales" },
        ...(isRestaurant
          ? []
          : [{ to: "/sales-return", icon: RotateCcw, label: "Sales Return" }]),
        { to: "/purchases", icon: ShoppingBag, label: "Purchases" },
        { to: "/purchases-return", icon: RotateCcw, label: "Purchases Return" },
        { to: "/purchases-payment", icon: HandCoins, label: "Purchases Payment" },
        { to: "/weastage-product", icon: Trash2, label: "Weastage Product" },
        { to: "/quotaion", icon: FileSpreadsheet, label: "Quotation" },
      ],
    },
    // ---- Masters ----
    {
      label: "Masters",
      items: [
        { to: "/categories", icon: FolderTree, label: "Categories" },
        { to: "/products", icon: Package, label: "Products" },
        { to: "/customers", icon: Users, label: "Customers" },
        { to: "/vendors", icon: Truck, label: "Vendors" },
        { to: "/employees", icon: UserCheck, label: "Employees" },
      ],
    },
    // ---- Finance (updated to match sidebar) ----
    {
      label: "Finance",
      items: [
        { to: "/expance-category", icon: FolderTree, label: "Expense Category" },
        { to: "/account", icon: Wallet, label: "Account" },
        { to: "/income", icon: ArrowDownCircle, label: "Transaction" },
        { to: "/attendance", icon: CalendarCheck, label: "Attendance" },
      ],
    },
    // ---- Reports (new) ----
    {
      label: "Reports",
      items: [
        { to: "/reports/inventory", icon: Boxes, label: "Stock Report" },
        { to: "/reports/gst", icon: FileText, label: "GST Report" },
        { to: "/reports/orders", icon: ClipboardList, label: "Order Report" },
        { to: "/reports/transaction-report", icon: FileText, label: "Transaction Report" },
        { to: "/reports/vendor-payment-reminder", icon: HandCoins, label: "Vendor Payment Reminder" },
        { to: "/reports/customer-payment-reminder", icon: HandCoins, label: "Customer Payment Reminder" },
        { to: "/reports/sms", icon: FileText, label: "SMS" },
      ],
    },
    // ---- Random (new) ----
    {
      label: "Random",
      items: [{ to: "/settings", icon: Settings, label: "Settings" }],
    },
    // ---- Legal ----
    {
      label: "Legal",
      items: [
        { to: "/privacy", icon: ShieldCheck, label: "Privacy Policy" },
        { to: "/terms", icon: FileText, label: "Terms & Conditions" },
      ],
    },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile */}
      <div className="rounded-2xl border border-border bg-gradient-cool p-5 text-primary-foreground shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-foreground/15 font-display text-xl font-bold">
            {(user?.username || "U").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold truncate">{user?.username}</p>
            <p className="text-xs opacity-85 truncate">
              {isRestaurant ? "Restaurant Owner" : "Shop Owner"} • {user?.shopName}
            </p>
            <p className="text-xs opacity-85">FY {user?.financialYear || "2025-26"}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-1.5 text-xs opacity-90">
          <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {user?.mobile || "—"}</span>
          <span className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5" /> {user?.email || "—"}</span>
        </div>
      </div>

      {/* Appearance */}
      <div>
        <p className="text-[10px] font-display font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
          Appearance
        </p>
        <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-card">
          <ThemeToggle variant="row" />
        </div>
      </div>

      {menuGroups.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] font-display font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
            {group.label}
          </p>
          <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-card divide-y divide-border">
            {group.items.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="flex items-center justify-between px-3 py-3 hover:bg-muted transition-colors"
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{item.label}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* Social */}
      <div>
        <p className="text-[10px] font-display font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
          Follow us
        </p>
        <div className="flex items-center gap-2">
          {socials.map((s) => (
            <a
              key={s.label}
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={s.label}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-card hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <s.icon className="h-4 w-4" />
            </a>
          ))}
        </div>
      </div>

      {/* Account actions */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-card divide-y divide-border">
        <button
          onClick={() => navigate("/more")}
          className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted transition-colors"
        >
          <span className="flex items-center gap-3">
            <User className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Account details</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-3 text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="text-sm font-semibold">Logout</span>
        </button>
      </div>

      <p className="text-center text-[11px] text-muted-foreground pb-4">
        Trackdesk • Version {APP_VERSION}
      </p>
    </div>
  );
};

export default MoreMenu;