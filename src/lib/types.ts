export type Snapshot = {
  fid: number
  score: number // normalized 0..1
  captured_at: string // ISO timestamp
  source: 'onchain' | 'api'
}

export type UserIdentity = {
  fid: number
  username?: string
  displayName?: string
  pfpUrl?: string
}
