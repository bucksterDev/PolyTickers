'use client'

import { http, createConfig } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected, coinbaseWallet } from 'wagmi/connectors'

// Wagmi config for Base chain
// Supports MetaMask, Rabby, Coinbase Wallet, and any injected wallet
export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    injected(), // MetaMask, Rabby, Brave, etc
    coinbaseWallet({ appName: 'Polytickers' }),
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
  },
})

// Base USDC address
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
