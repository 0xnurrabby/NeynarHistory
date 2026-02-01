import React, { createContext, useContext, useMemo, useState } from 'react'

export type Toast = {
  id: string
  kind: 'success' | 'error' | 'info'
  title: string
  message?: string
}

type ToastCtx = {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  remove: (id: string) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const ctx = useMemo<ToastCtx>(
    () => ({
      toasts,
      push: (t) => {
        const id = crypto.randomUUID()
        setToasts((prev) => [...prev, { ...t, id }].slice(-4))
        // auto-dismiss
        setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3500)
      },
      remove: (id) => setToasts((prev) => prev.filter((x) => x.id !== id)),
    }),
    [toasts]
  )

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => ctx.remove(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const kindClasses =
    toast.kind === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100'
      : toast.kind === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100'
        : 'border-slate-200 bg-white text-slate-900 dark:border-white/15 dark:bg-white/10 dark:text-white'

  return (
    <div
      className={
        'pointer-events-auto w-full max-w-md rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-md ' +
        kindClasses
      }
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{toast.title}</div>
          {toast.message ? <div className="mt-0.5 text-sm opacity-90">{toast.message}</div> : null}
        </div>
        <button
          className="rounded-lg px-2 py-1 text-sm opacity-70 hover:opacity-100 active:scale-95"
          onClick={onClose}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('ToastProvider missing')
  return ctx
}
