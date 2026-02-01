import { sdk } from '@farcaster/miniapp-sdk'
import type { UserIdentity } from './types'

export async function ensureReady() {
  // The host shows a splash/loading screen until ready() is called.
  await sdk.actions.ready()
}

export function isInMiniApp(): boolean {
  // @ts-expect-error sdk has isInMiniApp on newer versions.
  return Boolean((sdk as any).isInMiniApp)
}

export async function getContextSafe(): Promise<any | null> {
  try {
    // @ts-expect-error
    return await (sdk as any).context
  } catch {
    return null
  }
}

export async function signInWithFarcaster(): Promise<{
  identity: UserIdentity
  siwf: { message: string; signature: string }
}> {
  const nonce = crypto.randomUUID().replaceAll('-', '').slice(0, 16)

  const res = await sdk.actions.signIn({
    nonce,
    acceptAuthAddress: true,
  })

  const ctx = await getContextSafe()
  const fid = Number(ctx?.user?.fid ?? ctx?.client?.fid ?? 0)
  const identity: UserIdentity = {
    fid,
    username: ctx?.user?.username,
    displayName: ctx?.user?.displayName,
    pfpUrl: ctx?.user?.pfpUrl,
  }

  return { identity, siwf: res }
}

export async function haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'selection') {
  try {
    if (kind === 'selection') {
      await sdk.haptics.selectionChanged()
      return
    }
    if (kind === 'success' || kind === 'error') {
      await sdk.haptics.notificationOccurred(kind)
      return
    }
    await sdk.haptics.impactOccurred(kind)
  } catch {
    // silently ignore when host doesn't support haptics
  }
}
