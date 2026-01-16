import { NextResponse } from 'next/server'

// DOME API for Polymarket markets
const DOME_API = 'https://api.domeapi.io/v1'
// Polymarket CLOB for live prices
const CLOB_API = 'https://clob.polymarket.com'

// Fetch live price from CLOB
async function fetchLivePrice(tokenId: string): Promise<number | null> {
  try {
    const res = await fetch(`${CLOB_API}/price?token_id=${tokenId}&side=buy`, {
      next: { revalidate: 10 }
    })
    if (res.ok) {
      const data = await res.json()
      return parseFloat(data.price || '0.5')
    }
  } catch (e) {
    // Silently fail, use fallback
  }
  return null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const tag = searchParams.get('tag') || ''
    const search = searchParams.get('search') || ''
    const livePrices = searchParams.get('live') !== 'false' // Default to live prices

    // Build DOME API params
    const params = new URLSearchParams({
      limit: limit.toString(),
      status: 'open',
    })
    
    if (tag) params.append('tag', tag)
    if (search) params.append('search', search)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    // Add API key if configured
    if (process.env.DOME_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.DOME_API_KEY}`
    }

    const response = await fetch(`${DOME_API}/polymarket/markets?${params}`, {
      headers,
      next: { revalidate: 30 }
    })

    if (!response.ok) {
      console.error(`DOME API error: ${response.status}`)
      throw new Error(`DOME API error: ${response.status}`)
    }

    const data = await response.json()
    
    // DOME returns { markets: [...], pagination: {...} }
    const rawMarkets = data.markets || []
    
    // Process markets
    const processedMarkets = rawMarkets
      .filter((m: any) => m.status === 'open' && m.side_a?.id && m.side_b?.id)
      .slice(0, limit)
      .map((m: any) => {
        // DOME API uses side_a and side_b format
        const sideA = m.side_a || {}
        const sideB = m.side_b || {}
        
        // Determine which side is Yes/No (or Up/Down, etc)
        const aLabel = (sideA.label || '').toLowerCase()
        const bLabel = (sideB.label || '').toLowerCase()
        
        let yesTokenId: string
        let noTokenId: string
        let yesLabel: string
        let noLabel: string
        
        // Check for Yes/No or treat first as "positive" outcome
        if (aLabel === 'yes' || aLabel === 'up' || aLabel === 'true') {
          yesTokenId = sideA.id
          noTokenId = sideB.id
          yesLabel = sideA.label || 'Yes'
          noLabel = sideB.label || 'No'
        } else if (bLabel === 'yes' || bLabel === 'up' || bLabel === 'true') {
          yesTokenId = sideB.id
          noTokenId = sideA.id
          yesLabel = sideB.label || 'Yes'
          noLabel = sideA.label || 'No'
        } else {
          // Default: side_a = Yes equivalent, side_b = No equivalent
          yesTokenId = sideA.id
          noTokenId = sideB.id
          yesLabel = sideA.label || 'Yes'
          noLabel = sideB.label || 'No'
        }

        // DOME includes prices in side objects (if available)
        const yesPrice = sideA.price ?? 0.5
        const noPrice = sideB.price ?? 0.5

        return {
          id: m.condition_id,
          conditionId: m.condition_id,
          question: m.title,
          slug: m.market_slug,
          description: m.resolution_source || '',
          image: m.image,
          category: m.tags?.[0] || 'General',
          tags: m.tags || [],
          endDate: m.end_time ? new Date(m.end_time * 1000).toISOString() : null,
          negRisk: false, // DOME doesn't expose this directly yet
          outcomes: [
            { name: yesLabel, price: yesPrice, tokenId: yesTokenId },
            { name: noLabel, price: noPrice, tokenId: noTokenId },
          ],
          volume: m.volume_total || 0,
          volume1Week: m.volume_1_week || 0,
          volume1Month: m.volume_1_month || 0,
          liquidity: 0,
          yesPrice: yesPrice,
          noPrice: noPrice,
          yesTokenId,
          noTokenId,
          hasTokenIds: !!(yesTokenId && noTokenId),
          status: m.status,
        }
      })
      .filter((m: any) => m.hasTokenIds)

    // Fetch live prices from CLOB if requested
    let markets = processedMarkets
    if (livePrices && processedMarkets.length > 0) {
      // Fetch prices in parallel (batch of first 20 to avoid rate limits)
      const marketsToPrice = processedMarkets.slice(0, 20)
      const pricePromises = marketsToPrice.map((m: any) => fetchLivePrice(m.yesTokenId))
      const prices = await Promise.all(pricePromises)
      
      markets = processedMarkets.map((m: any, i: number) => {
        if (i < prices.length && prices[i] !== null) {
          const liveYesPrice = prices[i]!
          return {
            ...m,
            yesPrice: liveYesPrice,
            noPrice: 1 - liveYesPrice,
            outcomes: [
              { ...m.outcomes[0], price: liveYesPrice },
              { ...m.outcomes[1], price: 1 - liveYesPrice },
            ],
            priceSource: 'clob',
          }
        }
        return { ...m, priceSource: 'dome' }
      })
    }

    return NextResponse.json({ 
      markets, 
      source: 'dome',
      pricesFrom: livePrices ? 'clob' : 'dome',
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error('Error fetching markets:', error)
    return NextResponse.json({ error: 'Failed to fetch markets', markets: [] }, { status: 500 })
  }
}
