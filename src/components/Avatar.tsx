import React, { useMemo, useState } from "react";

function initialsFrom(handle?: string | null) {
  const s = (handle || "").replace(/^@/, "").trim();
  if (!s) return "•";
  const parts = s.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const first = (parts[0] || s)[0] || "•";
  const second = (parts[1] || "")[0] || "";
  return (first + second).toUpperCase();
}

export function Avatar({
  url,
  handle,
  size = 36,
}: {
  url?: string | null;
  handle?: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const initials = useMemo(() => initialsFrom(handle), [handle]);

  if (!url || broken) {
    return (
      <div
        aria-label="Profile avatar"
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--tint)",
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: Math.max(12, Math.round(size * 0.33)),
          userSelect: "none",
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt="Profile"
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      onError={() => setBroken(true)}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        border: "1px solid var(--border)",
        objectFit: "cover",
        background: "var(--tint)",
      }}
      loading="lazy"
      decoding="async"
    />
  );
}
