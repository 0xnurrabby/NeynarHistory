import type { Snapshot } from './types'

const LS_KEY = 'nh:snapshots:v1'
const TRACK_KEY = 'nh:tracked:v1'

type Store = Record<string, Snapshot[]>

function readStore(): Store {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Store
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  localStorage.setItem(LS_KEY, JSON.stringify(store))
}

export function listSnapshots(fid: number): Snapshot[] {
  const store = readStore()
  return (store[String(fid)] ?? []).slice().sort((a, b) => a.captured_at.localeCompare(b.captured_at))
}

export function upsertSnapshot(s: Snapshot, dedupeMinutes = 30) {
  const store = readStore()
  const key = String(s.fid)
  const existing = (store[key] ?? []).slice().sort((a, b) => a.captured_at.localeCompare(b.captured_at))
  const last = existing[existing.length - 1]
  if (last) {
    const lastT = Date.parse(last.captured_at)
    const nextT = Date.parse(s.captured_at)
    const minutes = Math.abs(nextT - lastT) / 60000
    // Dedupe: if within window, replace last (keeps history smoother & avoids rate-limit spam)
    if (minutes <= dedupeMinutes) {
      existing[existing.length - 1] = s
      store[key] = existing
      writeStore(store)
      return
    }
    // If score identical and within 24h, still store (for audit) but UI collapses to changes
  }
  existing.push(s)
  store[key] = existing
  writeStore(store)
}

export function trackFid(fid: number) {
  const current = getTrackedFids()
  if (!current.includes(fid)) {
    const next = [...current, fid].slice(0, 200)
    localStorage.setItem(TRACK_KEY, JSON.stringify(next))
  }
}

export function untrackFid(fid: number) {
  const current = getTrackedFids().filter((x) => x !== fid)
  localStorage.setItem(TRACK_KEY, JSON.stringify(current))
}

export function getTrackedFids(): number[] {
  try {
    const raw = localStorage.getItem(TRACK_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  } catch {
    return []
  }
}
