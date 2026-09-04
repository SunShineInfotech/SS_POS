import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AppToaster } from "@/components/AppToaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Categories from "./pages/Categories";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Vendors from "./pages/Vendors";
import Employees from "./pages/Employees";
import Tables from "./pages/Tables";
import Sales from "./pages/Sales";
import Purchases from "./pages/Purchases";
import Income from "./pages/Income";
import Expenses from "./pages/Expenses";
import Attendance from "./pages/Attendance";
import MoreMenu from "./pages/MoreMenu";
import AddCustomer from "./pages/AddCustomer";
import AddVendor from "./pages/AddVendor";
import AddProduct from "./pages/AddProduct";
import AddCategory from "./pages/AddCategory";
import AddEmployee from "./pages/AddEmployee";
import AddTable from "./pages/AddTable";
import AddPurchase from "./pages/AddPurchase";
import AddIncome from "./pages/AddIncome";
import AddExpense from "./pages/AddExpense";
import AddAttendance from "./pages/AddAttendance";
import EditSale from "./pages/EditSale";
import RestaurantTables from "./pages/RestaurantTables";
import RestaurantBilling from "./pages/RestaurantBilling";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppToaster />
        <BrowserRouter basename="/POS">
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/restaurant-billing/:tableId"
                element={
                  <RequireAuth allow={["restaurant"]}>
                    <RestaurantBilling />
                  </RequireAuth>
                }
              />
              <Route
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<Dashboard />} />
                <Route
                  path="/pos"
                  element={
                    <RequireAuth allow={["shop"]}>
                      <POS />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/restaurant-tables"
                  element={
                    <RequireAuth allow={["restaurant"]}>
                      <RestaurantTables />
                    </RequireAuth>
                  }
                />
                <Route path="/categories" element={<Categories />} />
                <Route path="/categories/new" element={<AddCategory />} />
                <Route path="/categories/:id?" element={<AddCategory />} />
                <Route path="/products" element={<Products />} />
                <Route path="/products/new" element={<AddProduct />} />
                <Route path="/products/:id?" element={<AddProduct />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/customers/new" element={<AddCustomer />} />
                <Route path="/customers/:id/edit" element={<AddCustomer />} />
                <Route path="/vendors" element={<Vendors />} />
                <Route path="/vendors/new" element={<AddVendor />} />
                <Route path="/vendors/:id?" element={<AddVendor />} />
                <Route path="/employees" element={<Employees />} />
                <Route path="/employees/new" element={<AddEmployee />} />
                <Route path="/employees/:id/edit" element={<AddEmployee />} />
                <Route path="/tables" element={<Tables />} />
                <Route path="/tables/new" element={<AddTable />} />
                <Route path="/tables/:id?" element={<AddTable />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/sales/:id/edit" element={<EditSale />} />
                <Route path="/purchases" element={<Purchases />} />
                <Route path="/purchases/new" element={<AddPurchase />} />
                <Route path="/purchases/:id/edit" element={<AddPurchase />} />
                <Route path="/income" element={<Income />} />
                <Route path="/income/new" element={<AddIncome />} />
                <Route path="/income/:id/edit" element={<AddIncome />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/expenses/new" element={<AddExpense />} />
                <Route path="/expenses/:id/edit" element={<AddExpense />} />
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/attendance/new" element={<AddAttendance />} />
                <Route
                  path="/attendance/:id/edit"
                  element={<AddAttendance />}
                />
                <Route path="/more" element={<MoreMenu />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
