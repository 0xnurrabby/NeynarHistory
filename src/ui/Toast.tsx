import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "./cn";

type Toast = { id: string; title: string; kind: "success" | "error" | "info" };

const ToastCtx = createContext<{ push: (t: Omit<Toast, "id">) => void } | null>(null);

function tone(kind: Toast["kind"]) {
  // High-contrast, professional tones for both light + dark.
  switch (kind) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100";
    default:
      return "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(16).slice(2);
    const toast: Toast = { id, ...t };
    setToasts((prev) => [...prev, toast]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed top-3 left-0 right-0 z-50 flex flex-col items-center gap-2 px-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "w-full max-w-[560px] rounded-xl border px-4 py-3 shadow-sm",
              "backdrop-blur supports-[backdrop-filter]:bg-white/90 supports-[backdrop-filter]:dark:bg-slate-900/80",
              tone(t.kind)
            )}
          >
            <div className="text-sm font-medium leading-snug">{t.title}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
