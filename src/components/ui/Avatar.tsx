"use client";
import React from "react";
import { User as UserIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export default function Avatar({
  src,
  alt = "",
  size = 28,
  className,
  seed,
  radius,
}: {
  src?: string | null;
  alt?: string;
  size?: number; // px
  className?: string;
  /**
   * Cadena para generar color determinístico cuando no hay avatar.
   * Suele ser id/email/nombre. Si no se provee, se usa `alt`.
   */
  seed?: string | null;
  /**
   * Radio de borde para la máscara del avatar. Por defecto círculo completo.
   * Útil para variantes con esquinas redondeadas (ej. 8, 10, '12px').
   */
  radius?: number | string;
}) {
  const has = (src ?? "").trim().length > 0;

  // Hash simple para color determinístico (HSL)
  const str = (seed ?? alt ?? "").trim();
  const hue = React.useMemo(() => {
    if (!str) return 220; // azul por defecto
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0; // 32-bit
    }
    return Math.abs(h) % 360;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [str]);

  const bg = `hsl(${hue} 70% 50%)`;
  const s: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius ?? 9999,
  };

  const initial = React.useMemo(() => {
    const from = (alt || str || "").trim();
    if (!from) return "";
    const parts = from.split(/\s+/).filter(Boolean);
    const ch = parts[0]?.[0] ?? from[0];
    return ch?.toUpperCase?.() ?? "";
  }, [alt, str]);
  return (
    <span
      className={cn(
        "inline-grid place-items-center overflow-hidden select-none",
        className
      )}
      style={s}
      aria-label={alt || undefined}
    >
      {has ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={(src as string).trim()} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initial ? (
          <span
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              background: bg,
              color: "#fff",
              fontWeight: 800,
              fontSize: Math.max(10, Math.floor(size * 0.45)),
            }}
          >
            {initial}
          </span>
        ) : (
          <span
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              background: bg,
              color: "#fff",
            }}
          >
            <UserIcon style={{ width: Math.round(size * 0.6), height: Math.round(size * 0.6) }} />
          </span>
        )
      )}
    </span>
  );
}
