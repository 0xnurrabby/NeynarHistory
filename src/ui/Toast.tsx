import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { cn } from './cn'

type Toast = { id: string; title: string; kind: 'success' | 'error' | 'info' }

const ToastCtx = createContext<{
  push: (t: Omit<Toast, 'id'>) => void
} | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    const toast: Toast = { id, ...t }
    setToasts((x) => [toast, ...x].slice(0, 3))
    window.setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 2600)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto w-full max-w-md rounded-2xl border px-4 py-3 text-sm shadow-soft backdrop-blur-md',
              t.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100'
                : t.kind === 'error'
                  ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-100'
                  : 'border-slate-200 bg-white/95 text-slate-900 dark:border-white/15 dark:bg-white/10 dark:text-white',
            )}
          >
            {t.title}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('ToastProvider missing')
  return ctx
}
