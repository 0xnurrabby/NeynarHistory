import { sdk } from '@farcaster/miniapp-sdk'
import type { UserIdentity } from './types'

export async function ensureReady() {
  // The host shows a splash/loading screen until ready() is called.
  await sdk.actions.ready()
}

export function isInMiniApp(): boolean {
  const v = (sdk as any).isInMiniApp
  return typeof v === 'function' ? Boolean(v.call(sdk)) : Boolean(v)
}

export async function getContextSafe(): Promise<any | null> {
  try {
    // sdk.context is a value in newer SDKs, but may be a promise in older ones.
    const ctx = (sdk as any).context
    return ctx && typeof ctx.then === 'function' ? await ctx : ctx
  } catch {
    return null
  }
}

async function getCapabilitiesSafe(): Promise<string[] | null> {
  try {
    const fn = (sdk as any).getCapabilities
    if (typeof fn !== 'function') return null
    const caps = await fn.call(sdk)
    return Array.isArray(caps) ? caps.map(String) : null
  } catch {
    return null
  }
}

export async function signInWithFarcaster(): Promise<{
  identity: UserIdentity
  siwf: { message: string; signature: string }
}> {
  const nonce = crypto.randomUUID().replaceAll('-', '').slice(0, 16)

  // If the host exposes capabilities, ensure sign-in is supported.
  const caps = await getCapabilitiesSafe()
  if (caps && !caps.includes('actions.signIn')) {
    throw new Error('This Farcaster client does not support Sign in with Farcaster. Please open in Warpcast.')
  }

  // Guard: some hosts silently ignore requests if anything breaks the gesture chain.
  // We also add a timeout so the UI never spins forever.
  const res = await Promise.race([
    sdk.actions.signIn({
      nonce,
      acceptAuthAddress: true,
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Sign-in timed out. Please try again.')), 15000)),
  ])

  const ctx = await getContextSafe()
  const fid = Number(ctx?.user?.fid ?? ctx?.client?.fid ?? 0)
  const identity: UserIdentity = {
    fid,
    username: ctx?.user?.username ?? ctx?.user?.username,
    displayName: ctx?.user?.displayName ?? ctx?.user?.display_name,
    pfpUrl: ctx?.user?.pfpUrl ?? ctx?.user?.pfp_url,
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
