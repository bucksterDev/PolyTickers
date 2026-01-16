import { NextResponse } from 'next/server'

// Polymarket Bridge API
const BRIDGE_API = 'https://bridge.polymarket.com'

// GET /api/deposit?address=0x...&chain=solana|base
// Returns deposit address for the user
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get('address')
    const chain = searchParams.get('chain') || 'solana' // 'solana' | 'base' | 'ethereum'

    if (!userAddress) {
      return NextResponse.json({ error: 'address required' }, { status: 400 })
    }

    // Request deposit addresses from Polymarket Bridge API
    const response = await fetch(`${BRIDGE_API}/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: userAddress,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Bridge API error:', errorText)
      throw new Error(`Bridge API error: ${response.status}`)
    }

    const data = await response.json()

    // Polymarket returns addresses for each chain type
    // { address: { evm: "0x...", svm: "...", btc: "..." } }
    let depositAddress: string
    let depositChain: string
    let instructions: string

    if (chain === 'solana') {
      depositAddress = data.address?.svm || data.svm
      depositChain = 'Solana'
      instructions = 'Send SOL or USDC-SPL to this address. Funds will be auto-converted to USDC.e on Polygon.'
    } else if (chain === 'base' || chain === 'ethereum') {
      depositAddress = data.address?.evm || data.evm
      depositChain = chain === 'base' ? 'Base' : 'Ethereum'
      instructions = `Send USDC on ${depositChain} to this address. Funds will be auto-bridged to Polygon.`
    } else {
      return NextResponse.json({ error: 'Invalid chain. Use: solana, base, ethereum' }, { status: 400 })
    }

    return NextResponse.json({
      depositAddress,
      chain: depositChain,
      instructions,
      supportedAssets: chain === 'solana' 
        ? ['SOL', 'USDC'] 
        : ['USDC', 'ETH'],
      note: 'Funds typically arrive in 1-5 minutes',
    })
  } catch (error) {
    console.error('Deposit API error:', error)
    return NextResponse.json({ 
      error: 'Failed to get deposit address',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// POST /api/deposit/status
// Check deposit status
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { depositAddress } = body

    if (!depositAddress) {
      return NextResponse.json({ error: 'depositAddress required' }, { status: 400 })
    }

    const response = await fetch(`${BRIDGE_API}/status/${depositAddress}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Status API error: ${response.status}`)
    }

    const data = await response.json()

    return NextResponse.json({
      status: data.status, // 'pending' | 'completed' | 'failed'
      deposits: data.deposits || [],
      totalDeposited: data.totalDeposited || 0,
    })
  } catch (error) {
    console.error('Deposit status error:', error)
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}
