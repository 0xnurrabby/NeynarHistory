import { sdk } from "@farcaster/miniapp-sdk";

export type SignedInUser = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

const SIGN_IN_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: any;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

export async function isMiniAppEnvironment(): Promise<boolean> {
  try {
    return await sdk.isInMiniApp();
  } catch {
    return false;
  }
}

export async function signInWithFarcaster(): Promise<SignedInUser> {
  // 1) Hard gate: must be in Mini App context, otherwise sign-in will bounce / fail.
  const inMini = await isMiniAppEnvironment();
  if (!inMini) {
    throw new Error(
      "Not in a Farcaster Mini App. Open https://neynar-history.vercel.app/ from a Farcaster client Mini App entry (no address bar)."
    );
  }

  // 2) Capability gate: only attempt signIn if the host supports it.
  const caps = await sdk.getCapabilities().catch(() => null as any);
  const hasSignIn = !!caps?.actions?.signIn;
  if (!hasSignIn) {
    throw new Error(
      "This client does not support Sign in with Farcaster in Mini Apps. Try opening in Warpcast (or another Mini App host that supports actions.signIn)."
    );
  }

  // 3) Perform sign-in with a timeout so the UI never spins forever.
  await withTimeout(sdk.actions.signIn({}), SIGN_IN_TIMEOUT_MS, "Sign-in");

  // 4) Read context.
  const ctx = await sdk.context;
  const u = ctx?.user;
  if (!u?.fid) throw new Error("Sign-in succeeded but user context is missing.");

  return {
    fid: u.fid,
    username: u.username,
    displayName: u.displayName,
    pfpUrl: u.pfpUrl,
  };
}
