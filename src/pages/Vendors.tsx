// src/pages/Vendors.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import { VendorService, Vendor } from "@/services/vendor.service";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const Vendors = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const company = getCompanyData();

  const columns = [
    { key: "vendor_name", label: "Name" },
    { key: "vendor_mobile_no", label: "Mobile" },
    { key: "vendor_city_name", label: "City", render: (v: any) => v || "-" },
    { key: "vendor_gst_number", label: "GST Number", render: (v: any) => v || "-" },
    {
      key: "vendor_wallet",
      label: "Wallet",
      render: (v: any) => `₹${Number(v || 0).toFixed(2)}`,
    },
  ];

  const fetchVendors = async () => {
    if (!company) {
      toast.error("Company data not found");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await VendorService.getVendors(company.company_id, company.franchise_id);
      if (res.status === "success" && res.data) {
        const mapped = res.data.map((item) => ({
          ...item,
          id: item.vendor_id,
        }));
        setData(mapped);
      } else {
        toast.error(res.message || "Failed to fetch vendors");
      }
    } catch (error) {
      console.error("Error fetching vendors:", error);
      toast.error("Failed to fetch vendors. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only once

  const handleDelete = async (id: number) => {
    if (!company) return;
    try {
      const res = await VendorService.deleteVendor(id, company.company_id, company.franchise_id);
      if (res.status === "success") {
        setData((prev) => prev.filter((v) => Number(v.vendor_id) !== id));
        toast.success(res.message || "Deleted");
      } else {
        toast.error(res.message || "Failed to delete");
      }
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Failed to delete vendor.");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading vendors...</div>;
  }

  return (
    <DataTable
      data={data}
      columns={columns}
      onAdd={() => navigate("/vendors/new")}
      onEdit={(row) => navigate(`/vendors/${row.id}`)}
      onDelete={(id) => handleDelete(id as number)}
      addLabel="Add Vendor"
      hideStatusToggle
    />
  );
};

export default Vendors;