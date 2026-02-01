import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { Skeleton } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'
import type { UserIdentity } from '../lib/types'
import { haptic, signInWithFarcaster } from '../lib/fc'
import { resolveHandleToFid } from '../lib/fnames'
import { listSnapshots, upsertSnapshot } from '../lib/storage'

async function fetchCurrentScore(fid: number): Promise<{ score: number; captured_at: string }> {
  const r = await fetch(`/api/score?fid=${encodeURIComponent(String(fid))}`);
  const data = await r.json().catch(() => null) as any;
  if (!r.ok || !data?.ok) throw new Error(data?.error || "Failed to fetch score.");
  return { score: data.score, captured_at: data.captured_at };
}

const ID_KEY = 'nh:identity:v1'

function loadIdentity(): UserIdentity | null {
  try {
    const raw = localStorage.getItem(ID_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UserIdentity
  } catch {
    return null
  }
}

function saveIdentity(id: UserIdentity | null) {
  if (!id) localStorage.removeItem(ID_KEY)
  else localStorage.setItem(ID_KEY, JSON.stringify(id))
}

export function HomeView({ onOpenUser }: { onOpenUser: (fid: number) => void }) {
  const toast = useToast()
  const [identity, setIdentity] = useState<UserIdentity | null>(() => loadIdentity())
  const [signing, setSigning] = useState(false)

  const [q, setQ] = useState('')
  const [resolving, setResolving] = useState(false)
  const [qError, setQError] = useState<string | undefined>(undefined)

  const selfLastSnap = useMemo(() => {
    if (!identity?.fid) return null
    const snaps = listSnapshots(identity.fid)
    return snaps[snaps.length - 1] ?? null
  }, [identity?.fid])

  const [selfLoading, setSelfLoading] = useState(false)
  const [selfScore, setSelfScore] = useState<number | null>(() => (selfLastSnap ? selfLastSnap.score : null))
  const [selfFetchedAt, setSelfFetchedAt] = useState<string | null>(() => (selfLastSnap ? selfLastSnap.captured_at : null))

  useEffect(() => {
    if (!identity?.fid) return
    ;(async () => {
      setSelfLoading(true)
      try {
        const snap = await fetchCurrentScore(identity.fid)
        if (snap) {
          upsertSnapshot(snap)
          setSelfScore(snap.score)
          setSelfFetchedAt(snap.captured_at)
        } else if (selfLastSnap) {
          setSelfScore(selfLastSnap.score)
          setSelfFetchedAt(selfLastSnap.captured_at)
        }
      } catch {
        if (selfLastSnap) {
          setSelfScore(selfLastSnap.score)
          setSelfFetchedAt(selfLastSnap.captured_at)
        } else {
          setSelfScore(null)
          setSelfFetchedAt(null)
        }
      } finally {
        setSelfLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.fid])

  async function onSignIn() {
    setSigning(true)
    setQError(undefined)
    try {
      await haptic('selection')
      const { identity: id } = await signInWithFarcaster()
      if (!id.fid) throw new Error('Missing FID from host context.')
      saveIdentity(id)
      setIdentity(id)
      toast.push({ kind: 'success', title: 'Signed in' })
      await haptic('success')
    } catch (e: any) {
      toast.push({ kind: 'error', title: e?.message ?? 'Sign-in failed' })
      await haptic('error')
    } finally {
      setSigning(false)
    }
  }

  async function onLookup() {
    setResolving(true)
    setQError(undefined)
    try {
      const raw = q.trim()
      if (!raw) throw new Error('Enter @handle or FID.')
      let fid: number
      if (/^@/.test(raw)) {
        fid = await resolveHandleToFid(raw)
      } else if (/^\d+$/.test(raw)) {
        fid = Number(raw)
      } else {
        throw new Error('Invalid input. Examples: @farcaster or 3')
      }
      toast.push({ kind: 'success', title: `Opened FID ${fid}` })
      await haptic('light')
      onOpenUser(fid)
    } catch (e: any) {
      const msg = e?.message ?? 'Lookup failed'
      setQError(msg)
      toast.push({ kind: 'error', title: msg })
      await haptic('error')
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">Neynar History</div>
          <div className="mt-1 text-sm text-slate-600 dark:text-white/70">
            Current score + snapshot history (7/30/90 days).
          </div>
        </div>
        {identity ? (
          <Button
            variant="ghost"
            onClick={() => {
              saveIdentity(null)
              setIdentity(null)
              toast.push({ kind: 'info', title: 'Signed out' })
            }}
          >
            Sign out
          </Button>
        ) : null}
      </header>

      <Card className="p-5">
        {!identity ? (
          <div className="flex flex-col gap-4">
            <div className="text-sm text-slate-600 dark:text-white/70">
              Sign in to view your own score instantly and track users over time.
            </div>
            <Button loading={signing} onClick={onSignIn}>
              Sign in with Farcaster
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              {identity.pfpUrl ? (
                <img
                  src={identity.pfpUrl}
                  alt=""
                  className="h-11 w-11 rounded-2xl border border-slate-200 object-cover dark:border-white/15"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-11 w-11 rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/15 dark:bg-white/10" />
              )}
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">
                  {identity.username ? '@' + identity.username : 'FID ' + identity.fid}
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-white/65">
                  FID {identity.fid}
                </div>
              </div>
              <div className="ml-auto">
                <Button variant="outline" onClick={() => onOpenUser(identity.fid)}>
                  View 90-day history
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/12 dark:bg-white/8">
              <div className="text-xs text-slate-500 dark:text-white/65">Your current score</div>
              {selfLoading ? (
                <div className="mt-2 flex items-center gap-3">
                  <Skeleton className="h-10 w-28" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                  <div className="text-4xl font-semibold tabular-nums">{selfScore == null ? '—' : selfScore.toFixed(3)}</div>
                  <div className="text-xs text-slate-500 dark:text-white/65">
                    Last fetched {selfFetchedAt ? new Date(selfFetchedAt).toLocaleString() : '—'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="text-base font-semibold">Look up a user</div>
        <div className="mt-1 text-sm text-slate-600 dark:text-white/70">
          Enter @handle or numeric FID.
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="@farcaster or 3"
            error={qError}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onLookup()
            }}
          />
          <Button className="sm:w-44" loading={resolving} onClick={onLookup}>
            Open
          </Button>
        </div>

        <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/12 dark:bg-white/8 text-xs text-slate-600 dark:text-white/70">
          <div className="font-semibold text-slate-900 dark:text-white/90">Possible factors (not guaranteed)</div>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Reduced activity over time can be associated with lower scores.</li>
            <li>Model recalibrations can shift scores across many accounts at once.</li>
          </ul>
          <div className="mt-3 text-slate-500 dark:text-white/60">
            Neynar does not provide a per-change explanation feed here. These are general possibilities, not a definitive audit.
          </div>
        </div>
      </Card>
    </div>
  )
}