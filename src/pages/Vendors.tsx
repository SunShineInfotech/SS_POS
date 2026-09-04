import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import axios from "axios";

interface Vendor {
  id: number;
  name: string;
  mobile_no: string;
  city_name: string;
  gst_number: string;
  wallet: number;
}

const columns = [
  { key: "name" as const, label: "Name" },
  { key: "mobile_no" as const, label: "Mobile" },
  { key: "city_name" as const, label: "City" },
  { key: "gst_number" as const, label: "GST Number" },
  {
    key: "wallet" as const,
    label: "Wallet",
    render: (value: any) => `₹${Number(value || 0).toFixed(2)}`,
  },
];

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

const Vendors = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Vendor[]>([]);

  const fetchVendors = async () => {
    try {
      const userProfile = getUserProfile();
      const res = await axios.post(`${API_URL}vendor.php`, {
        type: 2,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
      });

      console.log("Fetch Vendors Response:", res.data);
      if (res.data.status === "success") {
        const tempData = res.data.data.map((item: any) => ({
          id: item.vendor_id,
          name: item.vendor_name,
          mobile_no: item.vendor_mobile_no,
          city_name: item.vendor_city_name,
          gst_number: item.vendor_gst_number,
          wallet: item.vendor_wallet,
        }));
        setData(tempData);
      } else {
        toast.error(res.data.message || "Failed to fetch vendors");
      }
    } catch (error) {
      console.error("Error fetching vendors:", error);
      toast.error("Failed to fetch vendors. Please try again.");
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleDelete = async (id: number) => {
    const userProfile = getUserProfile();
    try {
      const res = await axios.post(`${API_URL}vendor.php`, {
        type: 4,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
        vendor_id: id,
      });

      if (res.data.status === "success") {
        setData((prev) => prev.filter((v) => v.id !== id));
        toast.success(res.data.message || "Deleted");
      } else {
        toast.error(res.data.message || "Failed to delete vendor");
      }
    } catch (error) {
      console.error("Error deleting vendor:", error);
      toast.error("Failed to delete vendor. Please try again.");
    }
  };

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
