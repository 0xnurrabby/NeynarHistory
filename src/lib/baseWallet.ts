import sdk from "@farcaster/miniapp-sdk";
import { Attribution } from "https://esm.sh/ox/erc8021";

const BUILDER_CODE = "TODO_REPLACE_BUILDER_CODE";

const dataSuffix = Attribution.toDataSuffix({
  codes: [BUILDER_CODE],
});

export async function getEthProvider() {
  return await sdk.wallet.getEthereumProvider({
    capabilities: { dataSuffix },
  });
}

export async function ensureBaseMainnet() {
  const provider = await getEthProvider();
  const chainId = await provider.request({ method: "eth_chainId" });
  if (chainId === "0x2105") return { ok: true as const };

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2105" }],
    });
    return { ok: true as const };
  } catch (err: any) {
    const code = err?.code;
    if (code === 4001) return { ok: false as const, reason: "USER_REJECTED" as const };
    return { ok: false as const, reason: "SWITCH_FAILED" as const };
  }
}
