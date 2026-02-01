export const BASE_MAINNET_HEX = '0x2105'
export const BASE_SEPOLIA_HEX = '0x14a34'

export async function ensureBaseChain(ethereum: any, prefer: 'mainnet' | 'sepolia' = 'mainnet') {
  const target = prefer === 'mainnet' ? BASE_MAINNET_HEX : BASE_SEPOLIA_HEX
  try {
    const current = await ethereum.request({ method: 'eth_chainId' })
    if (current === target) return { ok: true as const, chainId: current }
  } catch {
    // continue to switch attempt
  }

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: target }],
    })
    return { ok: true as const, chainId: target }
  } catch (e: any) {
    return {
      ok: false as const,
      error:
        'Please switch your wallet to Base (chainId ' +
        target +
        '). If switching fails, open wallet settings and change network manually.',
      raw: e?.message,
    }
  }
}
