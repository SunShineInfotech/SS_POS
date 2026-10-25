// src/components/shared/ImagePreviewModal.tsx
// Desktop: centered dialog. Mobile: bottom sheet (slides up, swipe down to close).
import { useEffect, useState } from "react";
import { ImageOff, Loader2, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export interface PreviewImage {
  src: string;
  title?: string;
  subtitle?: string;
}

interface ImagePreviewModalProps {
  image: PreviewImage | null;
  onClose: () => void;
}

const PreviewBody = ({ src, title }: { src: string; title?: string }) => {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  useEffect(() => setStatus("loading"), [src]);

  return (
    <div className="relative flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl bg-muted/40">
      {status === "loading" && (
        <Loader2 className="absolute h-6 w-6 animate-spin text-muted-foreground" />
      )}
      {status === "error" ? (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
          <ImageOff className="h-8 w-8" />
          <span className="text-xs">Image could not be loaded</span>
        </div>
      ) : (
        <img
          src={src}
          alt={title || "Product image"}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`max-h-[65vh] w-full object-contain transition-opacity duration-300 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
};

export const ImagePreviewModal = ({ image, onClose }: ImagePreviewModalProps) => {
  const isMobile = useIsMobile();
  const open = Boolean(image);
  const handleOpenChange = (o: boolean) => !o && onClose();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent className="max-h-[92vh] rounded-t-2xl">
          <DrawerHeader className="flex items-start justify-between gap-3 px-4 pb-2 pt-3 text-left">
            <div className="min-w-0">
              <DrawerTitle className="truncate text-base">
                {image?.title || "Product image"}
              </DrawerTitle>
              <DrawerDescription className="truncate text-xs">
                {image?.subtitle || "Swipe down to close"}
              </DrawerDescription>
            </div>
            <DrawerClose
              className="rounded-full bg-muted p-1.5 text-muted-foreground active:scale-95"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DrawerClose>
          </DrawerHeader>
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {image && <PreviewBody src={image.src} title={image.title} />}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl gap-3 p-4">
        <div className="pr-8">
          <DialogTitle className="truncate text-base">
            {image?.title || "Product image"}
          </DialogTitle>
          <DialogDescription className="truncate text-xs">
            {image?.subtitle || " "}
          </DialogDescription>
        </div>
        {image && <PreviewBody src={image.src} title={image.title} />}
      </DialogContent>
    </Dialog>
  );
};

export default ImagePreviewModal;
