import React, { useEffect, useMemo, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from './lib/wagmi'
import { ToastProvider } from './ui/Toast'
import { ensureReady, isInMiniApp } from './lib/fc'
import { HomeView } from './views/HomeView'
import { UserScoreView } from './views/UserScoreView'
import { sdk } from '@farcaster/miniapp-sdk'

function useRouteFid(): [number | null, (fid: number | null) => void] {
  const read = () => {
    const url = new URL(window.location.href)
    const fid = url.searchParams.get('fid')
    if (!fid) return null
    const n = Number(fid)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const [fid, setFid] = useState<number | null>(() => read())

  const nav = (next: number | null) => {
    const url = new URL(window.location.href)
    if (next == null) url.searchParams.delete('fid')
    else url.searchParams.set('fid', String(next))
    window.history.pushState({}, '', url.toString())
    setFid(next)
  }

  useEffect(() => {
    const onPop = () => setFid(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return [fid, nav]
}

export default function App() {
  useEffect(() => {
    // Hide the Mini App splash screen as soon as the UI is stable.
    sdk.actions.ready().catch(() => {})
  }, [])

  const [fid, setFid] = useRouteFid()
  const [ready, setReady] = useState(false)

  const inMini = useMemo(() => isInMiniApp(), [])

  useEffect(() => {
    ;(async () => {
      try {
        await ensureReady()
      } finally {
        setReady(true)
      }
    })()
  }, [])

  if (!ready) {
    return <div className="min-h-screen" />
  }

  if (!inMini) {
    // Strict: no browser-mode fallback UI.
    return (
      <div className="min-h-screen px-5 py-10">
        <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white dark:border-white/15 dark:bg-white/10 p-6">
          <div className="text-lg font-semibold">Open in a Farcaster client</div>
          <div className="mt-2 text-sm text-slate-600 dark:text-white/70">
            This app is a Farcaster Mini App and is designed to run with Mini App chrome. Please open it from Warpcast
            (or another Farcaster client) so it launches as a Mini App (no address bar).
          </div>
        </div>
      </div>
    )
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <ToastProvider>
        <div className="min-h-screen px-5 py-7 pb-16">
          <div className="mx-auto w-full max-w-3xl">
            {fid ? <UserScoreView fid={fid} onBack={() => setFid(null)} /> : <HomeView onOpenUser={(x) => setFid(x)} />}
          </div>
        </div>
      </ToastProvider>
    </WagmiProvider>
  )
}