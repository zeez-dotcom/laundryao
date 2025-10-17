import React, { useMemo, useState } from "react";

type SmartImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  placeholderSrc?: string;
};

function normalizeDriveUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("drive.google.com")) {
      const parts = u.pathname.split("/");
      const idx = parts.findIndex((p) => p === "d");
      if (idx !== -1 && parts[idx + 1]) {
        const id = parts[idx + 1];
        return `https://drive.google.com/uc?export=view&id=${id}`;
      }
      const idParam = u.searchParams.get("id");
      if (idParam) return `https://drive.google.com/uc?export=view&id=${idParam}`;
    }
  } catch {}
  return url;
}

export function SmartImage({ src, placeholderSrc = "/uploads/placeholder-clothing.png", alt, ...rest }: SmartImageProps) {
  // Cache failed URLs across mounts to avoid repeated network retries
  // (module-scoped; resets on full reload)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (!window.__SMART_IMAGE_FAILED__) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.__SMART_IMAGE_FAILED__ = new Set<string>();
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const FAILED_URLS: Set<string> = window.__SMART_IMAGE_FAILED__ as Set<string>;

  const [errored, setErrored] = useState(false);
  const safeSrc = useMemo(() => {
    const s = typeof src === "string" ? src : "";
    if (!s || s === "[object Object]") return placeholderSrc;
    const normalized = normalizeDriveUrl(s);
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
      const encoded = encodeURIComponent(normalized);
      const proxied = `/api/image-proxy?url=${encoded}`;
      if (FAILED_URLS.has(proxied)) return placeholderSrc;
      return proxied;
    }
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
  }, [src, placeholderSrc]);

  if (errored || (typeof safeSrc === 'string' && FAILED_URLS.has(safeSrc))) {
    return <img src={placeholderSrc} alt={alt ? `${alt} (failed to load)` : 'Image failed to load'} {...rest} />;
  }
  return (
    <img
      src={safeSrc}
      alt={alt}
      onError={() => {
        setErrored(true);
        if (typeof safeSrc === 'string') FAILED_URLS.add(safeSrc);
      }}
      {...rest}
    />
  );
}

export default SmartImage;
