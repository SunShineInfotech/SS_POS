import { Navigate, useLocation } from "react-router-dom";
import { useAuth, Role } from "@/contexts/AuthContext";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  allow?: Role[];
}

export const RequireAuth = ({ children, allow }: Props) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Jab tak localStorage se auth state check nahi ho jaata,
  // koi redirect decision mat lo — warna reload pe flash-logout hoga.
  if (isLoading) {
    return null; // ya yahan ek chhota spinner/loader dikha sakte ho
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (allow && !allow.includes(user.role)) {
    return (
      <Navigate
        to={user.role === "restaurant" ? "/restaurant-tables" : "/"}
        replace
      />
    );
  }
  return <>{children}</>;
};
