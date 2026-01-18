import { NextResponse } from 'next/server'

// Polymarket APIs
const GAMMA_API = 'https://gamma-api.polymarket.com'
const CLOB_API = 'https://clob.polymarket.com'

// Fetch live price from CLOB
async function fetchLivePrice(tokenId: string): Promise<number | null> {
  try {
    const res = await fetch(`${CLOB_API}/price?token_id=${tokenId}&side=buy`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 5 } // 5 second cache for live prices
    })
    if (res.ok) {
      const data = await res.json()
      return parseFloat(data.price || '0.5')
    }
  } catch (e) {
    console.error('CLOB price fetch error:', e)
  }
  return null
}

// Fetch midpoint price (more stable)
async function fetchMidpoint(tokenId: string): Promise<number | null> {
  try {
    const res = await fetch(`${CLOB_API}/midpoint?token_id=${tokenId}`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 5 }
    })
    if (res.ok) {
      const data = await res.json()
      return parseFloat(data.mid || '0.5')
    }
  } catch (e) {
    // Fallback to price endpoint
    return fetchLivePrice(tokenId)
  }
  return null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')

    // Search for up/down crypto markets specifically
    // These are the price prediction markets we want
    const searchTerms = ['updown', 'up down', 'price up', 'price down', 'SOL', 'BTC', 'ETH']
    
    // Try Gamma API to find active crypto price markets
    const eventsRes = await fetch(
      `${GAMMA_API}/events?active=true&closed=false&limit=100`,
      { 
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 30 }
      }
    )

    if (!eventsRes.ok) {
      throw new Error(`Gamma API error: ${eventsRes.status}`)
    }

    const eventsData = await eventsRes.json()
    
    // Filter for crypto up/down markets
    const upDownMarkets: any[] = []
    
    for (const event of eventsData) {
      // Look for crypto price prediction events
      const title = (event.title || '').toLowerCase()
      const slug = (event.slug || '').toLowerCase()
      
      // Check if this is an up/down market
      const isUpDown = 
        title.includes('up') || title.includes('down') ||
        title.includes('higher') || title.includes('lower') ||
        slug.includes('updown') ||
        (event.tags || []).some((t: any) => 
          t.slug?.includes('crypto') || t.label?.toLowerCase().includes('crypto')
        )
      
      // Check if it's a crypto asset
      const isCrypto = 
        title.includes('btc') || title.includes('bitcoin') ||
        title.includes('eth') || title.includes('ethereum') ||
        title.includes('sol') || title.includes('solana') ||
        title.includes('bnb') || title.includes('xrp') ||
        title.includes('doge') || title.includes('ada') ||
        title.includes('avax') || title.includes('link') ||
        title.includes('matic') || title.includes('polygon')
      
      if ((isUpDown && isCrypto) || slug.includes('updown')) {
        // Get the markets from this event
        for (const market of (event.markets || [])) {
          if (market.active && !market.closed && market.clobTokenIds?.length >= 2) {
            upDownMarkets.push({
              eventId: event.id,
              eventTitle: event.title,
              ...market
            })
          }
        }
      }
    }

    // If no up/down markets found, also search directly
    if (upDownMarkets.length === 0) {
      const searchRes = await fetch(
        `${GAMMA_API}/markets?active=true&closed=false&limit=50`,
        { 
          headers: { 'Accept': 'application/json' },
          next: { revalidate: 30 }
        }
      )
      
      if (searchRes.ok) {
        const marketsData = await searchRes.json()
        for (const m of marketsData) {
          const q = (m.question || '').toLowerCase()
          if ((q.includes('up') || q.includes('down') || q.includes('higher') || q.includes('lower')) &&
              (q.includes('btc') || q.includes('eth') || q.includes('sol') || q.includes('price'))) {
            if (m.clobTokenIds?.length >= 2) {
              upDownMarkets.push(m)
            }
          }
        }
      }
    }

    // Process and fetch live prices
    const processedMarkets = await Promise.all(
      upDownMarkets.slice(0, limit).map(async (m: any) => {
        // Parse outcomes
        let outcomes: string[] = []
        let prices: string[] = []
        
        try {
          outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || ['Yes', 'No'])
          prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || ['0.5', '0.5'])
        } catch {
          outcomes = ['Up', 'Down']
          prices = ['0.5', '0.5']
        }

        const yesTokenId = m.clobTokenIds?.[0] || ''
        const noTokenId = m.clobTokenIds?.[1] || ''
        
        // Fetch live price from CLOB
        let yesPrice = parseFloat(prices[0] || '0.5')
        let noPrice = parseFloat(prices[1] || '0.5')
        
        if (yesTokenId) {
          const livePrice = await fetchMidpoint(yesTokenId)
          if (livePrice !== null) {
            yesPrice = livePrice
            noPrice = 1 - livePrice
          }
        }

        // Extract asset from question
        const question = m.question || m.eventTitle || ''
        let asset = 'CRYPTO'
        if (question.toLowerCase().includes('btc') || question.toLowerCase().includes('bitcoin')) asset = 'BTC'
        else if (question.toLowerCase().includes('eth') || question.toLowerCase().includes('ethereum')) asset = 'ETH'
        else if (question.toLowerCase().includes('sol') || question.toLowerCase().includes('solana')) asset = 'SOL'
        else if (question.toLowerCase().includes('bnb')) asset = 'BNB'
        else if (question.toLowerCase().includes('xrp')) asset = 'XRP'
        else if (question.toLowerCase().includes('doge')) asset = 'DOGE'
        else if (question.toLowerCase().includes('avax')) asset = 'AVAX'
        else if (question.toLowerCase().includes('link')) asset = 'LINK'

        return {
          id: m.conditionId || m.id,
          conditionId: m.conditionId || m.id,
          question: question,
          slug: m.slug || m.market_slug || '',
          description: m.description || '',
          image: m.image || null,
          asset,
          category: 'crypto',
          endDate: m.endDateIso || m.end_date_iso || null,
          outcomes: [
            { name: outcomes[0] || 'Up', price: yesPrice, tokenId: yesTokenId },
            { name: outcomes[1] || 'Down', price: noPrice, tokenId: noTokenId },
          ],
          volume: m.volumeNum || m.volume || 0,
          liquidity: m.liquidityNum || m.liquidity || 0,
          yesPrice,
          noPrice,
          yesTokenId,
          noTokenId,
          hasTokenIds: !!(yesTokenId && noTokenId),
          priceSource: 'clob',
        }
      })
    )

    // Filter out any that didn't process correctly
    const validMarkets = processedMarkets.filter(m => m.hasTokenIds && m.yesPrice > 0)

    return NextResponse.json({ 
      markets: validMarkets,
      count: validMarkets.length,
      source: 'polymarket-clob',
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error('Error fetching markets:', error)
    
    // Return fallback demo markets if API fails
    const demoMarkets = [
      {
        id: 'demo-btc-1',
        conditionId: 'demo-btc-1',
        question: 'Will BTC be above $100,000 at 4PM ET?',
        slug: 'btc-100k-4pm',
        asset: 'BTC',
        category: 'crypto',
        endDate: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        outcomes: [
          { name: 'Up', price: 0.52, tokenId: 'demo-btc-yes' },
          { name: 'Down', price: 0.48, tokenId: 'demo-btc-no' },
        ],
        volume: 125000,
        yesPrice: 0.52,
        noPrice: 0.48,
        yesTokenId: 'demo-btc-yes',
        noTokenId: 'demo-btc-no',
        hasTokenIds: true,
        priceSource: 'demo',
      },
      {
        id: 'demo-eth-1',
        conditionId: 'demo-eth-1',
        question: 'Will ETH be above $3,500 at 4PM ET?',
        slug: 'eth-3500-4pm',
        asset: 'ETH',
        category: 'crypto',
        endDate: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        outcomes: [
          { name: 'Up', price: 0.48, tokenId: 'demo-eth-yes' },
          { name: 'Down', price: 0.52, tokenId: 'demo-eth-no' },
        ],
        volume: 89000,
        yesPrice: 0.48,
        noPrice: 0.52,
        yesTokenId: 'demo-eth-yes',
        noTokenId: 'demo-eth-no',
        hasTokenIds: true,
        priceSource: 'demo',
      },
      {
        id: 'demo-sol-1',
        conditionId: 'demo-sol-1',
        question: 'Will SOL be above $200 at 4PM ET?',
        slug: 'sol-200-4pm',
        asset: 'SOL',
        category: 'crypto',
        endDate: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        outcomes: [
          { name: 'Up', price: 0.55, tokenId: 'demo-sol-yes' },
          { name: 'Down', price: 0.45, tokenId: 'demo-sol-no' },
        ],
        volume: 67000,
        yesPrice: 0.55,
        noPrice: 0.45,
        yesTokenId: 'demo-sol-yes',
        noTokenId: 'demo-sol-no',
        hasTokenIds: true,
        priceSource: 'demo',
      },
    ]
    
    return NextResponse.json({ 
      markets: demoMarkets,
      count: demoMarkets.length,
      source: 'demo-fallback',
      error: 'API unavailable, showing demo markets',
      timestamp: Date.now(),
    })
  }
}
