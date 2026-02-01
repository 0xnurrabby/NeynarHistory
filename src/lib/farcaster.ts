import sdk from "@farcaster/miniapp-sdk";

export async function ensureMiniAppOrThrow(): Promise<void> {
  const ok = await sdk.isInMiniApp();
  if (!ok) throw new Error("NOT_IN_MINIAPP");
}

export async function ready(): Promise<void> {
  await sdk.actions.ready();
}

export async function getContext() {
  return await sdk.context;
}

export async function signIn(nonce: string) {
  return await sdk.actions.signIn({ nonce });
}
