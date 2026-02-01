import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv, kvEnabled } from '../_kv'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

const CONTRACT = '0xd3C43A38D1D3E47E9c420a733e439B03FAAdebA8' as const
const ABI = [
  {
    type: 'function',
    name: 'getScore',
    stateMutability: 'view',
    inputs: [{ name: 'fid', type: 'uint256' }],
    outputs: [{ name: 'score', type: 'uint24' }],
  },
] as const

const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })

type Snapshot = { fid: number; score: number; captured_at: string; source: 'onchain' }

function snapKey(fid: number) {
  return `nh:snapshots:v1:${fid}`
}

function dedupeAppend(existing: Snapshot[], next: Snapshot, dedupeMinutes = 30) {
  const sorted = existing.slice().sort((a, b) => a.captured_at.localeCompare(b.captured_at))
  const last = sorted[sorted.length - 1]
  if (last) {
    const minutes = Math.abs(Date.parse(next.captured_at) - Date.parse(last.captured_at)) / 60000
    if (minutes <= dedupeMinutes) {
      sorted[sorted.length - 1] = next
      return sorted
    }
  }
  sorted.push(next)
  return sorted
}

async function fetchScore(fid: number) {
  const raw = await client.readContract({ address: CONTRACT, abi: ABI, functionName: 'getScore', args: [BigInt(fid)] })
  const normalized = Number(raw) / 1_000_000
  if (!Number.isFinite(normalized) || normalized <= 0) return null
  return Math.max(0, Math.min(1, normalized))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!kvEnabled()) {
    res.status(200).json({ enabled: false, reason: 'KV not configured' })
    return
  }

  const tracked = ((await kv.get<number[]>('nh:tracked:v1')) ?? []).filter((x) => typeof x === 'number' && x > 0).slice(0, 200)

  const results: Array<{ fid: number; ok: boolean; reason?: string }> = []

  for (const fid of tracked) {
    try {
      const score = await fetchScore(fid)
      if (score == null) {
        results.push({ fid, ok: false, reason: 'No score' })
        continue
      }
      const next: Snapshot = { fid, score, captured_at: new Date().toISOString(), source: 'onchain' }
      const existing = ((await kv.get<Snapshot[]>(snapKey(fid))) ?? []).slice()
      const updated = dedupeAppend(existing, next)
      await kv.set(snapKey(fid), updated)
      results.push({ fid, ok: true })
    } catch (e: any) {
      results.push({ fid, ok: false, reason: e?.message ?? 'error' })
    }
  }

  res.status(200).json({ enabled: true, tracked: tracked.length, results })
}
