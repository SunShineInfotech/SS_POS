import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FormPageProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onSave?: () => void;
  saveLabel?: string;
  backTo?: string;
  extraActions?: ReactNode;
}

export const FormPage = ({ title, subtitle, children, onSave, saveLabel = "Save", backTo, extraActions }: FormPageProps) => {
  const navigate = useNavigate();
  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <div className="flex items-center justify-between gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur -mx-4 md:-mx-6 px-4 md:px-6 py-3 border-b">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => (backTo ? navigate(backTo) : navigate(-1))} className="h-9 w-9 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold truncate">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {extraActions}
          {onSave && (
            <Button onClick={onSave} className="font-display text-sm">
              {saveLabel}
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-2xl bg-card border border-border p-4 md:p-6 shadow-sm">{children}</div>
    </div>
  );
};
