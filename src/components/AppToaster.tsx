import { Toaster as Sonner } from "sonner";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Desktop: corner toast pop-ups. Mobile/tablet: bottom, full-width snackbar.
 */
export const AppToaster = () => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();

  return (
    <Sonner
      theme={theme as "light" | "dark" | "system"}
      position={isMobile ? "bottom-center" : "top-right"}
      closeButton={!isMobile}
      offset={isMobile ? 90 : 16}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: `group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-float ${
            isMobile ? "group-[.toaster]:w-[calc(100vw-2rem)] group-[.toaster]:rounded-2xl group-[.toaster]:py-4" : ""
          }`,
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-success",
          warning: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-warning",
          error: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-destructive",
          info: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-info",
        },
      }}
    />
  );
};
