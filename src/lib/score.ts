import type { Snapshot } from './types'

/**
 * Fetches the latest Neynar user score via our server API.
 * (We keep the old function name to avoid touching UI code.)
 */
export async function fetchOnchainScore(fid: number) {
  const r = await fetch(`/api/score?fid=${encodeURIComponent(String(fid))}`)
  if (!r.ok) return null
  const json = await r.json()
  const snap = json?.snapshot
  if (!snap || typeof snap.score !== 'number' || typeof snap.captured_at !== 'string') return null
  return {
    fid,
    score: Math.max(0, Math.min(1, snap.score)),
    captured_at: String(snap.captured_at),
    source: 'api',
  } satisfies Snapshot
}

export function rangeSnapshots(snapshots: Snapshot[], days: 7 | 30 | 90) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return snapshots.filter((s) => Date.parse(s.captured_at) >= cutoff)
}

export function withDeltas(snapshots: Snapshot[]) {
  const sorted = snapshots.slice().sort((a, b) => a.captured_at.localeCompare(b.captured_at))
  return sorted.map((s, i) => {
    const prev = sorted[i - 1]
    const delta = prev ? s.score - prev.score : 0
    return { ...s, delta }
  })
}

export function changeTimeline(snapshots: Snapshot[]) {
  const deltas = withDeltas(snapshots)
  return deltas.filter((s, i) => i === 0 || Math.abs(s.delta) > 0)
}
