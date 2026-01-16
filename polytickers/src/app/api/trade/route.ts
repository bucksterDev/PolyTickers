import { NextResponse } from 'next/server'

const DOME_API = 'https://api.domeapi.io/v1'

// POST /api/trade - Trading actions via DOME Router
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action } = body

    if (!process.env.DOME_API_KEY) {
      return NextResponse.json({ error: 'DOME_API_KEY not configured' }, { status: 500 })
    }

    if (action === 'link') {
      // Link user - returns EIP-712 payload for signing
      const { userId, walletAddress } = body

      if (!userId || !walletAddress) {
        return NextResponse.json({ error: 'userId and walletAddress required' }, { status: 400 })
      }

      // Request EIP-712 payload from DOME
      const response = await fetch(`${DOME_API}/polymarket/router/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DOME_API_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          wallet_address: walletAddress,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('DOME link error:', errorText)
        throw new Error(`DOME API error: ${response.status}`)
      }

      const data = await response.json()
      
      // Returns EIP-712 payload for user to sign
      return NextResponse.json({
        success: true,
        payload: data.payload, // EIP-712 typed data to sign
        message: 'Sign this message to link your wallet for gasless trading',
      })
    }

    if (action === 'complete-link') {
      // Complete linking after user signs
      const { userId, walletAddress, signature } = body

      if (!userId || !walletAddress || !signature) {
        return NextResponse.json({ error: 'userId, walletAddress, and signature required' }, { status: 400 })
      }

      const response = await fetch(`${DOME_API}/polymarket/router/link/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DOME_API_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          wallet_address: walletAddress,
          signature: signature,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('DOME complete-link error:', errorText)
        throw new Error(`DOME API error: ${response.status}`)
      }

      const data = await response.json()
      
      return NextResponse.json({
        success: true,
        credentials: data.credentials, // Store these securely for the user
        message: 'Wallet linked successfully! You can now trade without signing each order.',
      })
    }

    if (action === 'order') {
      // Place an order via DOME Router
      const { userId, tokenId, side, size, price, credentials } = body

      if (!userId || !tokenId || !side || !size || !price) {
        return NextResponse.json({ 
          error: 'userId, tokenId, side, size, and price required' 
        }, { status: 400 })
      }

      const response = await fetch(`${DOME_API}/polymarket/router/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DOME_API_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          token_id: tokenId,
          side: side, // 'buy' | 'sell'
          size: size, // Number of shares
          price: price, // 0-1
          credentials: credentials, // User's stored credentials
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('DOME order error:', errorText)
        throw new Error(`DOME API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      
      return NextResponse.json({
        success: true,
        orderId: data.order_id,
        status: data.status,
        message: 'Order placed successfully',
      })
    }

    if (action === 'cancel') {
      // Cancel an order
      const { userId, orderId, credentials } = body

      if (!userId || !orderId) {
        return NextResponse.json({ error: 'userId and orderId required' }, { status: 400 })
      }

      const response = await fetch(`${DOME_API}/polymarket/router/order/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DOME_API_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          credentials: credentials,
        }),
      })

      if (!response.ok) {
        throw new Error(`DOME API error: ${response.status}`)
      }

      return NextResponse.json({
        success: true,
        message: 'Order cancelled',
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Trade API error:', error)
    return NextResponse.json({ 
      error: 'Trade failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET /api/trade?wallet=xxx - Get user's orders and positions
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')

    if (!walletAddress) {
      return NextResponse.json({ error: 'wallet address required' }, { status: 400 })
    }

    if (!process.env.DOME_API_KEY) {
      return NextResponse.json({ error: 'DOME_API_KEY not configured' }, { status: 500 })
    }

    // Get user's orders from DOME
    const ordersRes = await fetch(`${DOME_API}/polymarket/orders?user=${walletAddress}&limit=50`, {
      headers: {
        'Authorization': `Bearer ${process.env.DOME_API_KEY}`,
      },
    })

    const ordersData = ordersRes.ok ? await ordersRes.json() : { orders: [] }

    return NextResponse.json({
      orders: ordersData.orders || [],
      positions: [], // Would need to fetch from Polymarket Data API
    })
  } catch (error) {
    console.error('Get orders error:', error)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}
