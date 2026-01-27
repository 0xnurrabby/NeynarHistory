import { createPublicClient, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import type { Snapshot } from './types'

const MAINNET_CONTRACT = '0xd3C43A38D1D3E47E9c420a733e439B03FAAdebA8' as const
const SEPOLIA_CONTRACT = '0x7104CFfdf6A1C9ceF66cA0092c37542821C1EA50' as const

const ABI = [
  {
    type: 'function',
    name: 'getScore',
    stateMutability: 'view',
    inputs: [{ name: 'fid', type: 'uint256' }],
    outputs: [{ name: 'score', type: 'uint24' }],
  },
] as const

const mainnetClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
})

const sepoliaClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
})

export async function fetchOnchainScore(fid: number, network: 'base' | 'base-sepolia' = 'base') {
  const client = network === 'base' ? mainnetClient : sepoliaClient
  const address = network === 'base' ? MAINNET_CONTRACT : SEPOLIA_CONTRACT

  const raw = await client.readContract({
    address,
    abi: ABI,
    functionName: 'getScore',
    args: [BigInt(fid)],
  })

  const rawNum = Number(raw)
  // Contract returns uint24 scaled by 1e6 (see example thresholds like 950000).
  const normalized = rawNum / 1_000_000
  if (!Number.isFinite(normalized) || normalized <= 0) return null

  return {
    fid,
    score: Math.max(0, Math.min(1, normalized)),
    captured_at: new Date().toISOString(),
    source: 'onchain',
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
