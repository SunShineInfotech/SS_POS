import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { AppHeader } from "./AppHeader";

export const AppLayout = () => {
  const location = useLocation();
  const isPOS = location.pathname === "/pos";
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("pos:sidebar") === "collapsed");

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem("pos:sidebar", c ? "expanded" : "collapsed");
      return !c;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <DesktopSidebar collapsed={collapsed} onToggle={toggle} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {!isPOS && <AppHeader />}
        <main className={`flex-1 overflow-y-auto ${isPOS ? "" : "p-4 md:p-6 pb-28 md:pb-6"}`}>
          <Outlet />
        </main>

        <MobileBottomNav />
      </div>
    </div>
  );
};
