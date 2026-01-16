# Polytickers

Trade Polymarket prediction markets using **Solana** or **Base** - no Polygon wallet needed.

## How It Works

1. **Connect Wallet** - Phantom (Solana) or MetaMask/Rabby (Base)
2. **Deposit** - Send SOL/USDC to your Polymarket deposit address
3. **Trade** - Link wallet once, then trade gaslessly via DOME

### Architecture

```
User Wallet (Solana/Base)
    ↓
Polymarket Bridge API → Auto-converts to Polygon USDC.e
    ↓
DOME Router → Handles CLOB trading
    ↓
Polymarket (Polygon)
```

Users never need to:
- Have a Polygon wallet
- Hold MATIC for gas
- Manually bridge funds

## Features

- **Multi-chain deposits**: Solana (SOL, USDC) or Base (USDC)
- **Live CLOB prices**: Real-time prices from Polymarket orderbook
- **Gasless trading**: DOME Router handles all signing
- **Market data**: DOME API for market discovery

## Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Add your DOME_API_KEY

# Run dev server
npm run dev
```

## Environment Variables

```env
DOME_API_KEY=your-dome-api-key  # Required for trading
NEXT_PUBLIC_BASE_RPC_URL=...     # Optional
NEXT_PUBLIC_SOLANA_RPC_URL=...   # Optional
```

## Tech Stack

- **Next.js 14** - App router
- **wagmi v2** - Base wallet connection
- **@solana/wallet-adapter** - Solana wallet connection  
- **DOME SDK** - Market data & trading
- **Polymarket Bridge API** - Multi-chain deposits

## Revenue

Builder attribution is preserved through DOME Router - you earn credit for all orders placed through your app.

## Credits

Built on:
- [DOME API](https://domeapi.io) - Prediction market infrastructure
- [Polymarket](https://polymarket.com) - Prediction market protocol
- [wagmi](https://wagmi.sh) - React hooks for Ethereum
