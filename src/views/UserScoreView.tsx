import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'
import { haptic } from '../lib/fc'
import type { Snapshot } from '../lib/types'
import { resolveFidToHandle } from '../lib/fnames'
import { changeTimeline, fetchOnchainScore, rangeSnapshots, withDeltas } from '../lib/score'
import { getTrackedFids, listSnapshots, trackFid, untrackFid, upsertSnapshot } from '../lib/storage'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { useAccount, useConnect, useSendCalls } from 'wagmi'
import { dataSuffix } from '../lib/builderCode'
import { ensureBaseChain } from '../lib/chain'

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString()
}

function badgeFromDelta(delta: number) {
  if (delta > 0) return { label: 'Up', cls: 'bg-emerald-500/12 border-emerald-400/25 text-emerald-100' }
  if (delta < 0) return { label: 'Down', cls: 'bg-red-500/12 border-red-400/25 text-red-100' }
  return { label: 'Flat', cls: 'bg-white/8 border-white/15 text-white/85 dark:text-white/85 text-gray-700' }
}

function toCsv(rows: Array<{ captured_at: string; score: number; delta: number }>) {
  const head = ['captured_at', 'score', 'delta_vs_previous']
  const lines = [head.join(',')]
  for (const r of rows) {
    lines.push([r.captured_at, r.score.toFixed(6), r.delta.toFixed(6)].join(','))
  }
  return lines.join('\n')
}

async function fetchServerSnapshots(fid: number, days: 7 | 30 | 90) {
  const res = await fetch(`/api/snapshots?fid=${fid}&days=${days}`)
  if (!res.ok) return { enabled: false as const, snapshots: [] as Snapshot[] }
  const json = await res.json()
  return {
    enabled: Boolean(json.enabled),
    snapshots: (json.snapshots ?? []) as Snapshot[],
  }
}

async function postServerSnapshot(s: Snapshot) {
  const res = await fetch('/api/snapshots', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(s),
  })
  if (!res.ok) return false
  const json = await res.json()
  return Boolean(json.enabled)
}

async function postServerTrack(fid: number, track: boolean) {
  const res = await fetch('/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fid, track }),
  })
  if (!res.ok) return false
  const json = await res.json()
  return Boolean(json.enabled)
}

export function UserScoreView({ fid, onBack }: { fid: number; onBack: () => void }) {
  const toast = useToast()
  const [handle, setHandle] = useState<string | null>(null)
  const [range, setRange] = useState<7 | 30 | 90>(7)

  const [loading, setLoading] = useState(true)
  const [freshening, setFreshening] = useState(false)

  const [snaps, setSnaps] = useState<Snapshot[]>([])
  const [serverEnabled, setServerEnabled] = useState(false)

  const localTracked = useMemo(() => getTrackedFids(), [])
  const [tracked, setTracked] = useState(localTracked.includes(fid))

  useEffect(() => {
    ;(async () => {
      try {
        setHandle(await resolveFidToHandle(fid))
      } catch {
        setHandle(null)
      }
    })()
  }, [fid])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const local = listSnapshots(fid)
        const server = await fetchServerSnapshots(fid, 90)
        setServerEnabled(server.enabled)
        const merged = [...local, ...server.snapshots].sort((a, b) => a.captured_at.localeCompare(b.captured_at))
        // de-dupe by timestamp + score (simple)
        const uniq: Snapshot[] = []
        const seen = new Set<string>()
        for (const s of merged) {
          const k = `${s.captured_at}|${s.score}|${s.source}`
          if (seen.has(k)) continue
          seen.add(k)
          uniq.push(s)
        }
        setSnaps(uniq)
      } finally {
        setLoading(false)
      }
    })()
  }, [fid])

  async function refreshNow() {
    setFreshening(true)
    try {
      const snap = await fetchOnchainScore(fid, 'base')
      if (!snap) {
        toast.push({ kind: 'error', title: 'No onchain score for this FID (or temporarily unavailable).' })
        return
      }
      upsertSnapshot(snap)
      setSnaps((prev) => {
        const next = [...prev, snap].sort((a, b) => a.captured_at.localeCompare(b.captured_at))
        return next
      })
      const pushed = await postServerSnapshot(snap)
      if (pushed) setServerEnabled(true)
      toast.push({ kind: 'success', title: 'Fetched latest score' })
      await haptic('success')
    } catch (e: any) {
      toast.push({ kind: 'error', title: e?.message ?? 'Fetch failed' })
      await haptic('error')
    } finally {
      setFreshening(false)
    }
  }

  const inRange = useMemo(() => rangeSnapshots(snaps, range), [snaps, range])
  const rows = useMemo(() => withDeltas(inRange), [inRange])
  const latest = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  const trend = latest && prev ? badgeFromDelta(latest.score - prev.score) : badgeFromDelta(0)

  const timeline = useMemo(() => changeTimeline(inRange), [inRange])

  // ------- Tip / Builder Code demo (optional, but required by prompt) -------
  const { isConnected } = useAccount()
  const { connect, connectors, isPending: connecting } = useConnect()
  const { sendCallsAsync, isPending: sending } = useSendCalls()

  async function onTip() {
    try {
      await haptic('selection')
      // Connect
      if (!isConnected) {
        const c = connectors?.[0]
        if (!c) throw new Error('No Farcaster wallet connector available in this host.')
        await connect({ connector: c })
      }
      // Switch chain
      const ethereum = (window as any).ethereum
      if (!ethereum) throw new Error('Wallet provider not found.')
      const sw = await ensureBaseChain(ethereum, 'mainnet')
      if (!sw.ok) {
        toast.push({ kind: 'error', title: sw.error })
        return
      }

      // Send a tiny tip to a burn address (0x000...dEaD) as a safe demo.
      // Replace with a real recipient if you want to accept tips.
      await sendCallsAsync({
        calls: [
          {
            to: '0x000000000000000000000000000000000000dEaD',
            value: BigInt(100000000000000), // 0.0001 ETH
            data: '0x',
          },
        ],
        capabilities: { dataSuffix },
      })

      toast.push({ kind: 'success', title: 'Tip sent' })
      await haptic('success')
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? 'Transaction rejected'
      toast.push({ kind: 'error', title: msg })
      await haptic('error')
    }
  }

  function exportCsv() {
    const csv = toCsv(rows.map((r) => ({ captured_at: r.captured_at, score: r.score, delta: r.delta })))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `neynar-history-fid-${fid}-${range}d.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.push({ kind: 'success', title: 'CSV exported' })
  }

  async function toggleTrack() {
    const next = !tracked
    setTracked(next)
    if (next) trackFid(fid)
    else untrackFid(fid)

    const serverOk = await postServerTrack(fid, next)
    if (serverOk) setServerEnabled(true)

    toast.push({ kind: 'success', title: next ? 'Tracking enabled' : 'Tracking disabled' })
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{handle ?? `FID ${fid}`}</div>
          <div className="text-xs text-white/65 dark:text-white/65 text-gray-500">FID {fid}</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={toggleTrack}>
            {tracked ? 'Untrack' : 'Track'}
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
            Export CSV
          </Button>
        </div>
      </header>

      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs text-white/65 dark:text-white/65 text-gray-500">Current score (0–1)</div>
            {loading ? (
              <Skeleton className="mt-2 h-10 w-40" />
            ) : (
              <div className="mt-2 text-4xl font-semibold tabular-nums">{latest ? latest.score.toFixed(3) : '—'}</div>
            )}
            <div className="mt-2 text-xs text-white/65 dark:text-white/65 text-gray-500">
              Last fetched at {latest ? formatDate(latest.captured_at) : '—'}
              {serverEnabled ? ' • synced' : ' • local snapshots'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${trend.cls}`}>{trend.label}</div>
            <Button variant="primary" loading={freshening} onClick={refreshNow}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              className={
                'rounded-2xl border px-3 py-2 text-sm font-semibold transition active:scale-[0.99] ' +
                (range === d ? 'border-white/25 bg-white/12' : 'border-white/12 bg-white/6 hover:bg-white/8')
              }
              onClick={async () => {
                setRange(d as 7 | 30 | 90)
                await haptic('light')
              }}
            >
              {d}d
            </button>
          ))}
        </div>

        <div className="mt-5 h-64 w-full overflow-hidden rounded-3xl border border-white/12 bg-white/5 p-2">
          {loading ? (
            <div className="h-full w-full">
              <Skeleton className="h-full w-full" />
            </div>
          ) : rows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rows.map((r) => ({
                  date: new Date(r.captured_at).toLocaleDateString(),
                  score: r.score,
                }))}
                margin={{ top: 10, right: 12, left: 6, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: any) => Number(value).toFixed(4)}
                  labelFormatter={(label: any) => `Date: ${label}`}
                />
                <Line type="monotone" dataKey="score" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center text-sm text-white/65 dark:text-white/65 text-gray-500">
              No snapshots yet. Tap Refresh to capture one.
            </div>
          )}
        </div>

        {snaps.length && !loading ? (
          <div className="mt-3 text-xs text-white/60 dark:text-white/60 text-gray-500">
            {rows.length ? (
              <>
                History begins on <span className="font-semibold">{new Date(rows[0].captured_at).toLocaleDateString()}</span>.
              </>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">Table</div>
          <div className="text-xs text-white/60 dark:text-white/60 text-gray-500">Timestamp • score • change</div>
        </div>

        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length ? (
          <div className="mt-4 overflow-hidden rounded-3xl border border-white/12">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/6 text-xs text-white/70 dark:text-white/70 text-gray-500">
                <tr>
                  <th className="px-4 py-3">Captured at</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice()
                  .reverse()
                  .slice(0, 120)
                  .map((r) => (
                    <tr key={r.captured_at} className="border-t border-white/10">
                      <td className="px-4 py-3 text-xs">{formatDate(r.captured_at)}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{r.score.toFixed(4)}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {r === rows[0] ? '—' : (r.delta >= 0 ? '+' : '') + r.delta.toFixed(4)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 text-sm text-white/65 dark:text-white/65 text-gray-500">No rows yet.</div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">Score change timeline</div>
          <div className="text-xs text-white/60 dark:text-white/60 text-gray-500">Only points where score changed</div>
        </div>

        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : timeline.length ? (
          <div className="mt-4 space-y-2">
            {timeline
              .slice()
              .reverse()
              .map((s, i) => {
                const prev = timeline.slice().sort((a, b) => a.captured_at.localeCompare(b.captured_at))
                const idx = prev.findIndex((x) => x.captured_at === s.captured_at)
                const p = idx > 0 ? prev[idx - 1] : null
                const delta = p ? s.score - p.score : 0
                const b = badgeFromDelta(delta)
                return (
                  <div key={s.captured_at} className="flex items-center gap-3 rounded-3xl border border-white/12 bg-white/6 p-4">
                    <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${b.cls}`}>{b.label}</div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold tabular-nums">{s.score.toFixed(4)}</div>
                      <div className="text-xs text-white/60 dark:text-white/60 text-gray-500">{formatDate(s.captured_at)}</div>
                    </div>
                    <div className="ml-auto text-xs text-white/70 dark:text-white/70 text-gray-500 tabular-nums">
                      {p ? (delta >= 0 ? '+' : '') + delta.toFixed(4) : '—'}
                    </div>
                  </div>
                )
              })}
          </div>
        ) : (
          <div className="mt-4 text-sm text-white/65 dark:text-white/65 text-gray-500">
            No changes in this range yet.
          </div>
        )}

        <div className="mt-4 rounded-3xl border border-white/12 bg-white/8 p-4 text-xs text-white/70 dark:text-white/70 text-gray-600">
          <div className="font-semibold text-white/90 dark:text-white/90 text-gray-800">Possible factors (not guaranteed)</div>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Reduced activity over time can be associated with lower scores.</li>
            <li>Model recalibrations can shift scores across many accounts at once.</li>
          </ul>
          <div className="mt-3 text-white/60 dark:text-white/60 text-gray-500">
            Neynar does not provide a per-change explanation feed here. These are general possibilities, not a definitive audit.
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-base font-semibold">Optional: onchain verification + Builder Code</div>
        <div className="mt-1 text-sm text-white/70 dark:text-white/70 text-gray-600">
          Sends a tiny onchain tip (0.0001 ETH) with Base Builder Code attribution via <code>capabilities: {'{ dataSuffix }'}</code>.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button loading={connecting || sending} onClick={onTip}>
            Send tip
          </Button>
        </div>
        <div className="mt-2 text-xs text-white/60 dark:text-white/60 text-gray-500">
          If you reject the wallet confirmation, the UI resets cleanly (no crashes, no console spam).
        </div>
      </Card>
    </div>
  )
}
