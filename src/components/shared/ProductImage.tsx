// src/components/shared/ProductImage.tsx
// Product thumbnail with a placeholder when there's no image or it fails to load.
import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";
const IMAGE_BASE = API_URL.replace(/v1_api\/?$/, "");

/**
 * product_image comes back either as a full URL or a path relative to the site root.
 * The API prefixes the server URL even when no image is stored, so a value ending
 * in "/" is treated as "no image".
 */
export const resolveImage = (path?: string | null): string =>
  !path || /\/$/.test(path)
    ? ""
    : /^(https?:|data:|blob:)/i.test(path)
      ? path
      : `${IMAGE_BASE}${path.replace(/^\/+/, "")}`;

export const ProductImage = ({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed)
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          className,
        )}
      >
        <ImageOff className="h-1/3 w-1/3 opacity-40" />
      </div>
    );
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
};

export default ProductImage;
