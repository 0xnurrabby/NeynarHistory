import { sdk } from '@farcaster/miniapp-sdk';
import { Attribution } from "https://esm.sh/ox/erc8021";

// BUILDER CODE ATTRIBUTION (REQUIRED)
export const BUILDER_CODE = "TODO_REPLACE_BUILDER_CODE";
export const dataSuffix = Attribution.toDataSuffix({
  codes: [BUILDER_CODE]
});

const BASE_MAINNET_HEX = '0x2105';
const BASE_SEPOLIA_HEX = '0x14a34';

export type BaseChain = 'base-mainnet' | 'base-sepolia';

export async function getEthereumProviderWithAttribution() {
  const provider = await (sdk.wallet as any).getEthereumProvider({
    capabilities: { dataSuffix }
  });
  return provider as any;
}

export async function ensureBaseChain(provider: any): Promise<BaseChain> {
  const chainId = await provider.request({ method: 'eth_chainId' });
  if (chainId === BASE_MAINNET_HEX) return 'base-mainnet';
  if (chainId === BASE_SEPOLIA_HEX) return 'base-sepolia';

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_MAINNET_HEX }]
    });
    return 'base-mainnet';
  } catch (e: any) {
    // If the user rejects or the wallet doesn't support switching
    throw new Error('Please switch your wallet to Base (chainId 0x2105) and try again.');
  }
}
