import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShoppingCart, IndianRupee, Users, TrendingUp, TrendingDown, AlertTriangle, Clock, Search,
  UtensilsCrossed, Wallet, CalendarDays, CalendarRange, Package, Truck, Receipt, ArrowDownRight, ArrowUpRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

type Granularity = "daily" | "monthly" | "yearly";

const stats = [
  { label: "Today's Sales", value: "₹24,580", change: "+12%", up: true, icon: IndianRupee, color: "text-success", bg: "bg-success/10" },
  { label: "Orders", value: "48", change: "+8%", up: true, icon: ShoppingCart, color: "text-primary", bg: "bg-primary/10" },
  { label: "Customers", value: "156", change: "+3%", up: true, icon: Users, color: "text-info", bg: "bg-info/10" },
  { label: "Low Stock", value: "7", change: "", up: false, icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
];

const collections = [
  { label: "Today's Collection", value: "₹24,580", icon: Wallet, color: "text-primary", bg: "bg-primary/10" },
  { label: "This Month's Collection", value: "₹6,42,150", icon: CalendarDays, color: "text-accent", bg: "bg-accent/10" },
  { label: "This Year's Collection", value: "₹72,18,900", icon: CalendarRange, color: "text-success", bg: "bg-success/10" },
];

const businessCounts = [
  { label: "Total Sales", value: "₹78,42,300", icon: Receipt, color: "text-primary" },
  { label: "Total Purchases", value: "₹52,10,450", icon: Package, color: "text-info" },
  { label: "Total Other Income", value: "₹3,24,000", icon: ArrowDownRight, color: "text-success" },
  { label: "Total Other Expense", value: "₹8,76,540", icon: ArrowUpRight, color: "text-destructive" },
  { label: "Customer Outstanding", value: "₹4,18,220", icon: Users, color: "text-warning" },
  { label: "Vendor Outstanding", value: "₹2,95,600", icon: Truck, color: "text-warning" },
];

const recentOrders = [
  { id: "INV-001", customer: "Rahul Sharma", amount: "₹1,250", status: "Paid", time: "2 min ago" },
  { id: "INV-002", customer: "Priya Patel", amount: "₹890", status: "Paid", time: "15 min ago" },
  { id: "INV-003", customer: "Amit Kumar", amount: "₹2,340", status: "Pending", time: "32 min ago" },
  { id: "INV-004", customer: "Sneha Gupta", amount: "₹670", status: "Paid", time: "1 hr ago" },
  { id: "INV-005", customer: "Vikram Singh", amount: "₹3,100", status: "Pending", time: "2 hr ago" },
];

const tablesOverview = [
  { name: "Table 1", status: "Free", capacity: 4 },
  { name: "Table 2", status: "Booked", capacity: 2 },
  { name: "Table 3", status: "Free", capacity: 6 },
  { name: "Table 4", status: "Packed", capacity: 4 },
  { name: "Table 5", status: "Free", capacity: 8 },
  { name: "VIP Room 1", status: "Booked", capacity: 10 },
  { name: "Counter 1", status: "Free", capacity: 1 },
  { name: "Parcel 1", status: "Booked", capacity: 0 },
];

const statusColor: Record<string, string> = {
  Free: "bg-success/10 text-success border-success/30",
  Booked: "bg-destructive/10 text-destructive border-destructive/30",
  Packed: "bg-warning/15 text-warning border-warning/30",
};

const topProducts = [
  { name: "Veg Biryani", qty: 412, revenue: 82400 },
  { name: "Masala Dosa", qty: 388, revenue: 46560 },
  { name: "Paneer Tikka", qty: 265, revenue: 58300 },
  { name: "Butter Naan", qty: 640, revenue: 28800 },
  { name: "Cold Coffee", qty: 302, revenue: 36240 },
];

const expenseByCategory = [
  { name: "Rent", value: 240000 },
  { name: "Salary", value: 385000 },
  { name: "Electricity", value: 96000 },
  { name: "Raw Material", value: 452000 },
  { name: "Marketing", value: 78000 },
  { name: "Misc", value: 42000 },
];

const pieColors = [
  "hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--info))",
  "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))",
];

const outstandingCustomers = [
  { name: "Rahul Sharma", mobile: "98250 11223", amount: 84500, last: "2026-08-12" },
  { name: "Priya Patel", mobile: "98980 44112", amount: 62300, last: "2026-08-09" },
  { name: "Amit Kumar", mobile: "90332 78451", amount: 51200, last: "2026-08-05" },
  { name: "Sneha Gupta", mobile: "97129 66320", amount: 38700, last: "2026-07-28" },
  { name: "Vikram Singh", mobile: "88660 90211", amount: 29500, last: "2026-07-21" },
];

const outstandingVendors = [
  { name: "Shree Agro Foods", mobile: "99245 33112", amount: 91800, last: "2026-08-14" },
  { name: "Metro Beverages", mobile: "98795 21140", amount: 64200, last: "2026-08-10" },
  { name: "Fresh Dairy Co.", mobile: "90998 45521", amount: 47600, last: "2026-08-02" },
  { name: "Spice World", mobile: "97256 11009", amount: 36900, last: "2026-07-25" },
  { name: "Packaging Hub", mobile: "88221 70043", amount: 22400, last: "2026-07-18" },
];

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dataStartYear = 2022;
const dataEndYear = 2026;

/** Deterministic pseudo-random so the mock series is stable across renders. */
const seeded = (seed: number, min: number, max: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = x - Math.floor(x);
  return Math.round(min + frac * (max - min));
};

interface Series { label: string; a: number; b: number; }

const buildSeries = (
  granularity: Granularity,
  startDate: string,
  year: number,
  base: number,
  offset: number
): Series[] => {
  if (granularity === "daily") {
    const d = new Date(startDate);
    const y = d.getFullYear();
    const m = d.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) => ({
      label: String(i + 1),
      a: seeded(y * 1000 + m * 40 + i + offset, base * 0.4, base * 1.4),
      b: seeded(y * 1000 + m * 40 + i + offset + 7, base * 0.3, base * 1.1),
    }));
  }
  if (granularity === "monthly") {
    return monthNames.map((mn, i) => ({
      label: mn,
      a: seeded(year * 100 + i + offset, base * 12, base * 28),
      b: seeded(year * 100 + i + offset + 9, base * 8, base * 22),
    }));
  }
  const years: Series[] = [];
  for (let y = Math.max(year, dataStartYear); y <= dataEndYear; y++) {
    years.push({
      label: String(y),
      a: seeded(y + offset, base * 150, base * 320),
      b: seeded(y + offset + 5, base * 110, base * 260),
    });
  }
  return years;
};

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
};

interface TrendChartProps {
  title: string;
  aLabel: string;
  bLabel: string;
  base: number;
  offset: number;
  type: "bar" | "line";
}

const TrendChart = ({ title, aLabel, bLabel, base, offset, type }: TrendChartProps) => {
  const today = new Date().toISOString().split("T")[0];
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [startDate, setStartDate] = useState(today);
  const [year, setYear] = useState(new Date().getFullYear());

  const data = useMemo(
    () => buildSeries(granularity, startDate, year, base, offset),
    [granularity, startDate, year, base, offset]
  );

  return (
    <Card className="border-border">
      <CardHeader className="pb-2 space-y-3">
        <CardTitle className="font-display text-sm font-semibold tracking-tight">{title}</CardTitle>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="inline-flex rounded-lg border border-border overflow-hidden self-start">
            {(["daily", "monthly", "yearly"] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 text-[11px] font-medium capitalize transition-colors ${
                  granularity === g ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          {granularity === "daily" ? (
            <div className="flex items-center gap-2">
              <Label className="text-[11px] text-muted-foreground whitespace-nowrap">Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-xs w-40" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Label className="text-[11px] text-muted-foreground whitespace-nowrap">Start year</Label>
              <Input
                type="number"
                min={dataStartYear}
                max={dataEndYear}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="h-8 text-xs w-24 font-display"
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {type === "bar" ? (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `₹${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="a" name={aLabel} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="b" name={bLabel} fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `₹${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="a" name={aLabel} stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="b" name={bLabel} stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

interface OutstandingRow { name: string; mobile: string; amount: number; last: string; }

const OutstandingList = ({ title, rows, icon: Icon }: { title: string; rows: OutstandingRow[]; icon: typeof Users }) => (
  <Card className="border-border">
    <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
      <CardTitle className="font-display text-sm font-semibold tracking-tight flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </CardTitle>
      <span className="text-[11px] text-muted-foreground">
        ₹{rows.reduce((s, r) => s + r.amount, 0).toLocaleString()}
      </span>
    </CardHeader>
    <CardContent className="px-0">
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{r.name}</p>
              <p className="font-display text-[11px] text-muted-foreground">{r.mobile}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-display text-sm font-semibold text-warning">₹{r.amount.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Last: {r.last}</p>
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  return (
    <div className="space-y-5">
      {/* Date filter */}
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-xs font-semibold">Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs font-semibold">End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 h-9" />
            </div>
            <Button className="h-9 gap-1.5 bg-gradient-primary hover:opacity-90 font-display">
              <Search className="h-4 w-4" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Collection counts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {collections.map((c) => (
          <Card key={c.label} className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
                <c.icon className={`h-5 w-5 ${c.color}`} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-xl font-bold tracking-tight truncate">{c.value}</p>
                <p className="text-xs text-muted-foreground truncate">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Business counts */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {businessCounts.map((b) => (
          <Card key={b.label} className="border-border">
            <CardContent className="p-3.5">
              <b.icon className={`h-4 w-4 ${b.color}`} />
              <p className="font-display text-base font-bold mt-2 truncate">{b.value}</p>
              <p className="text-[11px] text-muted-foreground truncate">{b.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border overflow-hidden relative">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`h-8 w-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                {stat.change && (
                  <span className={`flex items-center gap-0.5 text-xs font-medium ${stat.up ? "text-success" : "text-destructive"}`}>
                    {stat.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {stat.change}
                  </span>
                )}
                {!stat.change && stat.label === "Low Stock" && <span className="text-xs font-medium text-warning">Alert</span>}
              </div>
              <p className="font-display text-2xl font-bold tracking-tight">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend graphs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TrendChart title="Sales vs Purchase Trend" aLabel="Sales" bLabel="Purchase" base={2000} offset={3} type="bar" />
        <TrendChart title="Income vs Expense Trend" aLabel="Income" bLabel="Expense" base={1200} offset={11} type="line" />
      </div>

      {/* Top products & expense categories */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm font-semibold tracking-tight">Top Selling Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number, n) => (n === "revenue" ? `₹${v.toLocaleString()}` : `${v} qty`)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="qty" name="Qty Sold" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm font-semibold tracking-tight">Expense by Category (₹)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseByCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {expenseByCategory.map((e, i) => (
                      <Cell key={e.name} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `₹${v.toLocaleString()}`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Outstanding lists */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <OutstandingList title="Top Outstanding Customers" rows={outstandingCustomers} icon={Users} />
        <OutstandingList title="Top Outstanding Vendors" rows={outstandingVendors} icon={Truck} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Orders */}
        <Card className="border-border lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm font-semibold tracking-tight">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="divide-y divide-border">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between px-4 sm:px-6 py-2.5 hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{order.customer}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-display text-xs text-muted-foreground">{order.id}</span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {order.time}
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-3">
                    <p className="font-display text-sm font-semibold">{order.amount}</p>
                    <span className={`text-[10px] font-medium ${order.status === "Paid" ? "text-success" : "text-warning"}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tables overview */}
      <Card className="border-border">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="font-display text-sm font-semibold tracking-tight flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-accent" />
            Tables Overview
          </CardTitle>
          <span className="text-[11px] text-muted-foreground">{tablesOverview.length} tables</span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {tablesOverview.map((t) => (
              <div key={t.name} className={`p-3 rounded-lg border-2 ${statusColor[t.status]}`}>
                <p className="font-display text-sm font-bold">{t.name}</p>
                <p className="text-[10px] mt-0.5 opacity-80">
                  {t.capacity > 0 ? `${t.capacity} seats` : "Takeaway"}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider mt-1">{t.status}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
