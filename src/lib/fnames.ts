export async function resolveHandleToFid(handle: string): Promise<number> {
  const name = handle.replace(/^@/, '').trim().toLowerCase()
  if (!name) throw new Error('Empty handle')

  const res = await fetch(`/api/resolve?name=${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error('Handle not found')
  const json = await res.json()
  const fid = Number(json?.fid)
  if (!Number.isFinite(fid) || fid <= 0) throw new Error('Handle not found')
  return fid
}

export async function resolveFidToHandle(fid: number): Promise<string | null> {
  const res = await fetch(`/api/resolve?fid=${encodeURIComponent(String(fid))}`)
  if (!res.ok) return null
  const json = await res.json()
  const handle = typeof json?.handle === 'string' ? json.handle : null
  return handle
}
