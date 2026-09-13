import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import { AccountService, Account } from "@/services/account.service";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const ACCOUNT_TYPE_LABELS: Record<number, string> = {
  1: "Bank",
  2: "Cash",
  3: "UPI/Wallet",
};

const Accounts = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const company = getCompanyData();

  const columns = [
    { key: "account_name", label: "Account Name" },
    {
      key: "account_type",
      label: "Type",
      render: (v: any) => ACCOUNT_TYPE_LABELS[Number(v)] || v,
    },
    { key: "account_number", label: "Account Number" },
    { key: "account_holder_name", label: "Holder Name" },
    {
      key: "account_balance",
      label: "Balance",
      render: (v: any) => `₹ ${Number(v).toFixed(2)}`,
    },
  ];

  const fetchData = async () => {
    if (!company) {
      toast.error("Company data not found");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await AccountService.getList(company.company_id, company.franchise_id);
      if (res.status === "success" && res.data) {
        const mapped = res.data.map((item) => ({
          ...item,
          id: item.account_id,
        }));
        setData(mapped);
      } else {
        toast.error(res.message || "Failed to fetch accounts");
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
      toast.error("Failed to fetch accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number) => {
    if (!company) return;
    try {
      const res = await AccountService.delete(id, company.company_id, company.franchise_id);
      if (res.status === "success") {
        setData((prev) => prev.filter((a) => Number(a.account_id) !== id));
        toast.success(res.message || "Deleted");
      } else {
        toast.error(res.message || "Failed to delete");
      }
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Failed to delete account.");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading accounts...</div>;
  }

  return (
    <DataTable
      data={data}
      columns={columns}
      onAdd={() => navigate("/account/new")}
      onEdit={(row) => navigate(`/account/${row.id}/edit`)}
      onDelete={(id) => handleDelete(id as number)}
      addLabel="Add Account"
      hideStatusToggle
    />
  );
};

export default Accounts;