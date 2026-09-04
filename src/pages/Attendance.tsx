import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarCheck, Clock, Users } from "lucide-react";
import { initStore, saveStore } from "@/lib/store";
import { toast } from "sonner";

interface Attendance {
  id: number;
  date: string;
  employee: string;
  checkIn: string;
  lunchStart: string;
  lunchEnd: string;
  checkOut: string;
  totalTime: string;
  workingHours: string;
  status: string;
  deleted?: boolean;
}

const initialAttendance: Attendance[] = [
  { id: 1, date: "2026-03-29", employee: "Ravi Kumar", checkIn: "09:00", lunchStart: "13:00", lunchEnd: "13:45", checkOut: "18:00", totalTime: "9h 00m", workingHours: "8h 15m", status: "Present" },
  { id: 2, date: "2026-03-29", employee: "Sunita Devi", checkIn: "09:15", lunchStart: "13:00", lunchEnd: "13:30", checkOut: "18:30", totalTime: "9h 15m", workingHours: "8h 45m", status: "Present" },
  { id: 3, date: "2026-03-29", employee: "Manoj Singh", checkIn: "10:00", lunchStart: "13:30", lunchEnd: "14:00", checkOut: "17:00", totalTime: "7h 00m", workingHours: "6h 30m", status: "Late" },
  { id: 4, date: "2026-03-29", employee: "Anjali Verma", checkIn: "-", lunchStart: "-", lunchEnd: "-", checkOut: "-", totalTime: "-", workingHours: "-", status: "Absent" },
];

const columns = [
  { key: "date" as const, label: "Date" },
  { key: "employee" as const, label: "Employee" },
  { key: "checkIn" as const, label: "Check In", render: (v: any) => <span className="font-display text-xs">{v}</span> },
  { key: "lunchStart" as const, label: "Lunch Start", render: (v: any) => <span className="font-display text-xs">{v}</span> },
  { key: "lunchEnd" as const, label: "Lunch End", render: (v: any) => <span className="font-display text-xs">{v}</span> },
  { key: "checkOut" as const, label: "Check Out", render: (v: any) => <span className="font-display text-xs">{v}</span> },
  { key: "totalTime" as const, label: "Total", render: (v: any) => <span className="font-display text-xs font-semibold">{v}</span> },
  { key: "workingHours" as const, label: "Working", render: (v: any) => <span className="font-display text-xs font-semibold">{v}</span> },
  {
    key: "status" as const,
    label: "Status",
    render: (v: any) => (
      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${v === "Present" ? "bg-success/10 text-success" : v === "Late" ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>{v}</span>
    ),
  },
];

const AttendancePage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Attendance[]>(() => initStore("attendance", initialAttendance));
  const persist = (next: Attendance[]) => { setData(next); saveStore("attendance", next); };

  const todayRecords = data.filter((a) => a.date === "2026-03-29" && !a.deleted);
  const presentToday = todayRecords.filter((a) => a.status === "Present" || a.status === "Late").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><CalendarCheck className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">Today</span></div>
          <p className="font-display text-lg font-bold">2026-03-29</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-success" /><span className="text-xs text-muted-foreground">Present</span></div>
          <p className="font-display text-2xl font-bold text-success">{presentToday}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Clock className="h-4 w-4 text-destructive" /><span className="text-xs text-muted-foreground">Absent</span></div>
          <p className="font-display text-2xl font-bold text-destructive">{todayRecords.length - presentToday}</p>
        </CardContent></Card>
      </div>
      <DataTable data={data} columns={columns}
        onAdd={() => navigate("/attendance/new")}
        onEdit={(row) => navigate(`/attendance/${row.id}/edit`)}
        addLabel="Mark Attendance"
        onDelete={(id) => { persist(data.map((a) => (a.id === id ? { ...a, deleted: true } : a))); toast.success("Deleted"); }}
        onRestore={(id) => { persist(data.map((a) => (a.id === id ? { ...a, deleted: false } : a))); toast.success("Restored"); }}
      />
    </div>
  );
};

export default AttendancePage;
