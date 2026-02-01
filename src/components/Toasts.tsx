import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastType = "success" | "error" | "warning" | "info";
type Toast = { id: string; type: ToastType; title: string; msg?: string };

const Ctx = createContext<{ push: (t: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setToasts((xs) => [...xs, { ...t, id }].slice(-2));
    window.setTimeout(() => {
      setToasts((xs) => xs.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toastwrap" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className="toast" role="status">
            <div className={`dot ${t.type}`} />
            <div>
              <div className="title">{t.title}</div>
              {t.msg ? <div className="msg">{t.msg}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToasts() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ToastProvider missing");
  return v;
}
