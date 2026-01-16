'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'
import { formatUnits } from 'viem'
import { BASE_USDC } from '@/lib/wagmi'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

// Types
interface MarketOutcome {
  name: string
  price: number
  tokenId: string
}

interface Market {
  id: string
  conditionId: string
  question: string
  slug: string
  description: string
  image: string | null
  category: string | null
  endDate: string
  outcomes: MarketOutcome[]
  volume: number
  liquidity: number
  yesPrice: number
  noPrice: number
  yesTokenId?: string
  noTokenId?: string
  negRisk?: boolean
  hasTokenIds?: boolean
  isUserCreated?: boolean
}

interface Position {
  id: number
  marketId: string
  question: string
  side: 'YES' | 'NO'
  stake: number
  entryPrice: number
  currentPrice: number
  tokenId: string
}

// Helpers
const fmtUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtVol = (v: number) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(0)}`
const fmtCents = (p: number) => `${Math.round(p * 100)}¢`

function getTimeRemaining(endDate: string) {
  if (!endDate) return ''
  const end = new Date(endDate).getTime()
  const now = Date.now()
  const total = Math.max(0, end - now)
  const days = Math.floor(total / (1000 * 60 * 60 * 24))
  const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  return 'soon'
}

export default function Home() {
  // Wallets
  const { address: baseAddress, isConnected: isBaseConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect: disconnectBase } = useDisconnect()
  const { data: baseUsdcBalance } = useBalance({ address: baseAddress, token: BASE_USDC })
  const { data: baseEthBalance } = useBalance({ address: baseAddress })
  const { publicKey: solanaPublicKey, connected: isSolanaConnected, disconnect: disconnectSolana } = useWallet()
  const { connection } = useConnection()
  const [solanaBalance, setSolanaBalance] = useState(0)

  const [activeChain, setActiveChain] = useState<'solana' | 'base'>('solana')
  const isConnected = activeChain === 'solana' ? isSolanaConnected : isBaseConnected
  const walletAddress = activeChain === 'solana' ? solanaPublicKey?.toBase58() : baseAddress

  // State
  const [view, setView] = useState<'markets' | 'positions' | 'wallet' | 'create'>('markets')
  const [markets, setMarkets] = useState<Market[]>([])
  const [userMarkets, setUserMarkets] = useState<Market[]>([])
  const [marketsLoading, setMarketsLoading] = useState(true)
  const [positions, setPositions] = useState<Position[]>([])
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null)
  const [demoBal, setDemoBal] = useState(10000)
  const [isRealMoney, setIsRealMoney] = useState(false)
  const [quickBetAmount, setQuickBetAmount] = useState(25)
  const [depositAddress, setDepositAddress] = useState<string | null>(null)
  const [depositLoading, setDepositLoading] = useState(false)
  const [newMarketQuestion, setNewMarketQuestion] = useState('')
  const [newMarketCategory, setNewMarketCategory] = useState('')
  const [newMarketEndDate, setNewMarketEndDate] = useState('')
  const [tradingReady, setTradingReady] = useState(false)

  const tradingBalance = isRealMoney ? 0 : demoBal

  // Effects
  useEffect(() => {
    if (solanaPublicKey && connection) {
      connection.getBalance(solanaPublicKey).then(bal => setSolanaBalance(bal / LAMPORTS_PER_SOL))
    }
  }, [solanaPublicKey, connection])

  const fetchMarkets = useCallback(async () => {
    setMarketsLoading(true)
    try {
      const response = await fetch('/api/markets?limit=50&live=true')
      const data = await response.json()
      setMarkets(data.markets || [])
    } catch (e) {
      console.error('Markets fetch error:', e)
    } finally {
      setMarketsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMarkets()
    const interval = setInterval(fetchMarkets, 60000)
    return () => clearInterval(interval)
  }, [fetchMarkets])

  useEffect(() => {
    if (walletAddress) {
      const stored = localStorage.getItem(`trading_linked_${walletAddress}`)
      if (stored) setTradingReady(true)
    }
  }, [walletAddress])

  // Handlers
  const getDepositAddress = async () => {
    if (!walletAddress) return
    setDepositLoading(true)
    try {
      const res = await fetch(`/api/deposit?address=${walletAddress}&chain=${activeChain}`)
      const data = await res.json()
      if (data.depositAddress) setDepositAddress(data.depositAddress)
    } catch (e) {
      console.error('Failed to get deposit address:', e)
    } finally {
      setDepositLoading(false)
    }
  }

  const handleBet = async (market: Market, side: 'YES' | 'NO', amount: number) => {
    if (!isConnected) {
      alert('Connect wallet first')
      return
    }
    const price = side === 'YES' ? market.yesPrice : market.noPrice
    const tokenId = side === 'YES' ? (market.yesTokenId || market.outcomes[0]?.tokenId) : (market.noTokenId || market.outcomes[1]?.tokenId)

    if (isRealMoney) {
      if (!tradingReady) {
        alert('Link your wallet first (Wallet tab)')
        return
      }
      try {
        const res = await fetch('/api/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'order',
            userId: walletAddress,
            tokenId,
            side: 'buy',
            size: amount / price,
            price,
          }),
        })
        const data = await res.json()
        if (data.success) {
          setPositions(prev => [...prev, {
            id: Date.now(),
            marketId: market.id,
            question: market.question,
            side,
            stake: amount,
            entryPrice: price,
            currentPrice: price,
            tokenId: tokenId!,
          }])
        } else {
          throw new Error(data.error || 'Order failed')
        }
      } catch (e: any) {
        alert(`Order failed: ${e.message}`)
      }
    } else {
      if (demoBal < amount) {
        alert('Insufficient balance')
        return
      }
      setDemoBal(prev => prev - amount)
      setPositions(prev => [...prev, {
        id: Date.now(),
        marketId: market.id,
        question: market.question,
        side,
        stake: amount,
        entryPrice: price,
        currentPrice: price,
        tokenId: tokenId || `demo-${Date.now()}`,
      }])
    }
  }

  const createUserMarket = () => {
    if (!newMarketQuestion.trim() || !newMarketCategory || !newMarketEndDate) return
    const newMarket: Market = {
      id: `user-${Date.now()}`,
      conditionId: `user-${Date.now()}`,
      question: newMarketQuestion,
      slug: newMarketQuestion.toLowerCase().replace(/\s+/g, '-').slice(0, 50),
      description: '',
      image: null,
      category: newMarketCategory,
      endDate: new Date(newMarketEndDate).toISOString(),
      outcomes: [
        { name: 'Yes', price: 0.5, tokenId: `user-yes-${Date.now()}` },
        { name: 'No', price: 0.5, tokenId: `user-no-${Date.now()}` },
      ],
      volume: 0,
      liquidity: 1000,
      yesPrice: 0.5,
      noPrice: 0.5,
      isUserCreated: true,
    }
    setUserMarkets(prev => [newMarket, ...prev])
    setNewMarketQuestion('')
    setNewMarketCategory('')
    setNewMarketEndDate('')
    setView('markets')
  }

  const linkWalletForTrading = () => {
    if (!walletAddress) return
    localStorage.setItem(`trading_linked_${walletAddress}`, 'true')
    setTradingReady(true)
  }

  const totalPnl = positions.reduce((sum, p) => {
    return sum + ((p.currentPrice / p.entryPrice - 1) * p.stake)
  }, 0)

  // Styles
  const s = {
    container: { minHeight: '100vh', background: 'var(--bg-primary)' },
    header: {
      padding: '20px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid var(--border)',
      position: 'sticky' as const,
      top: 0,
      background: 'rgba(13,13,13,0.95)',
      backdropFilter: 'blur(10px)',
      zIndex: 50,
    },
    logo: {
      fontFamily: 'var(--font-display)',
      fontSize: 32,
      letterSpacing: '0.05em',
      color: 'var(--text-primary)',
    },
    tag: (color: string) => ({
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      padding: '4px 8px',
      background: color,
      color: '#000',
      marginLeft: 12,
      fontWeight: 500,
    }),
    nav: {
      display: 'flex',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
    },
    navBtn: (active: boolean) => ({
      flex: 1,
      padding: '16px',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      letterSpacing: '0.1em',
      background: active ? 'var(--bg-primary)' : 'transparent',
      color: active ? 'var(--accent-green)' : 'var(--text-secondary)',
      border: 'none',
      borderBottom: active ? '2px solid var(--accent-green)' : '2px solid transparent',
      cursor: 'pointer',
      textTransform: 'uppercase' as const,
      transition: 'all 0.2s',
    }),
    main: { maxWidth: 900, margin: '0 auto', padding: '24px 20px' },
    card: (highlight?: boolean) => ({
      background: highlight ? 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)' : 'var(--bg-secondary)',
      border: highlight ? '1px solid var(--accent-gold)' : '1px solid var(--border)',
      padding: 20,
      marginBottom: 12,
      cursor: 'pointer',
      transition: 'all 0.2s',
    }),
    cardQuestion: {
      fontFamily: 'var(--font-serif)',
      fontSize: 18,
      lineHeight: 1.4,
      color: 'var(--text-primary)',
      marginBottom: 12,
    },
    mono: (size = 11) => ({
      fontFamily: 'var(--font-mono)',
      fontSize: size,
      color: 'var(--text-secondary)',
    }),
    btn: (color: string, filled = true) => ({
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      letterSpacing: '0.05em',
      padding: '12px 20px',
      background: filled ? color : 'transparent',
      color: filled ? '#000' : color,
      border: filled ? 'none' : `1px solid ${color}`,
      cursor: 'pointer',
      transition: 'all 0.15s',
      textTransform: 'uppercase' as const,
    }),
    input: {
      width: '100%',
      fontFamily: 'var(--font-mono)',
      fontSize: 14,
      padding: '14px 16px',
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border)',
      color: 'var(--text-primary)',
      outline: 'none',
    },
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={s.logo}>POLYTICKERS</span>
          <span style={s.tag(isRealMoney ? 'var(--accent-green)' : 'var(--accent-gold)')}>
            {isRealMoney ? 'LIVE' : 'DEMO'}
          </span>
          <span style={s.tag(activeChain === 'solana' ? '#9945FF' : '#0052FF')}>
            {activeChain.toUpperCase()}
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isConnected && (
            <>
              <div style={{ textAlign: 'right', marginRight: 8 }}>
                <div style={{ ...s.mono(10), color: 'var(--text-muted)' }}>BALANCE</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--accent-green)' }}>
                  ${fmtUsd(tradingBalance)}
                </div>
              </div>
              <button
                onClick={() => setIsRealMoney(!isRealMoney)}
                style={s.btn('var(--text-secondary)', false)}
              >
                {isRealMoney ? '→ Demo' : '→ Live'}
              </button>
            </>
          )}
          
          <select
            value={activeChain}
            onChange={(e) => setActiveChain(e.target.value as 'solana' | 'base')}
            style={{
              ...s.mono(10),
              padding: '10px 14px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <option value="solana">SOLANA</option>
            <option value="base">BASE</option>
          </select>

          {activeChain === 'solana' ? (
            <WalletMultiButton style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              height: 40,
              background: isSolanaConnected ? '#9945FF' : 'var(--accent-green)',
              color: isSolanaConnected ? '#fff' : '#000',
            }} />
          ) : (
            isBaseConnected ? (
              <button onClick={() => disconnectBase()} style={s.btn('#0052FF')}>
                {baseAddress?.slice(0, 6)}...{baseAddress?.slice(-4)}
              </button>
            ) : (
              <button onClick={() => connect({ connector: connectors[0] })} style={s.btn('var(--accent-green)')}>
                Connect
              </button>
            )
          )}
        </div>
      </header>

      {/* Status Bar */}
      {isConnected && (
        <div style={{
          background: isRealMoney 
            ? (tradingReady ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)')
            : 'rgba(255,215,0,0.1)',
          borderBottom: `1px solid ${isRealMoney ? (tradingReady ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--accent-gold)'}`,
          padding: '10px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ ...s.mono(11), color: isRealMoney ? (tradingReady ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--accent-gold)' }}>
            {isRealMoney 
              ? tradingReady 
                ? `● LIVE TRADING ACTIVE — ${activeChain === 'solana' ? solanaBalance.toFixed(4) + ' SOL' : (baseUsdcBalance ? parseFloat(formatUnits(baseUsdcBalance.value, 6)).toFixed(2) : '0') + ' USDC'}`
                : '○ WALLET NOT LINKED FOR TRADING'
              : `◉ DEMO MODE — $${fmtUsd(demoBal)} PLAY MONEY`}
          </span>
          {isRealMoney && !tradingReady && (
            <button onClick={() => setView('wallet')} style={s.btn('var(--accent-red)', false)}>
              Setup Trading
            </button>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav style={s.nav}>
        {['markets', 'positions', 'wallet', 'create'].map(v => (
          <button
            key={v}
            onClick={() => setView(v as any)}
            style={s.navBtn(view === v)}
          >
            {v}
            {v === 'positions' && positions.length > 0 && ` (${positions.length})`}
          </button>
        ))}
      </nav>

      {/* Main */}
      <main style={s.main}>
        {/* Markets */}
        {view === 'markets' && (
          <div className="animate-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, margin: 0, letterSpacing: '0.02em' }}>
                  LIVE MARKETS
                </h2>
                <p style={{ ...s.mono(11), marginTop: 4 }}>
                  {markets.length} markets · prices from CLOB
                </p>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[10, 25, 50, 100].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setQuickBetAmount(amt)}
                    style={{
                      ...s.mono(10),
                      padding: '8px 12px',
                      background: quickBetAmount === amt ? 'var(--accent-green)' : 'var(--bg-tertiary)',
                      color: quickBetAmount === amt ? '#000' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {marketsLoading ? (
              <div style={{ textAlign: 'center', padding: 60, ...s.mono(12) }}>
                <span style={{ animation: 'pulse 1.5s infinite' }}>Loading markets...</span>
              </div>
            ) : (
              <div>
                {userMarkets.map((market, i) => (
                  <MarketCard
                    key={market.id}
                    market={market}
                    quickBetAmount={quickBetAmount}
                    onBet={handleBet}
                    onClick={() => setSelectedMarket(market)}
                    isUserCreated
                    delay={i * 0.05}
                  />
                ))}
                {markets.map((market, i) => (
                  <MarketCard
                    key={market.id}
                    market={market}
                    quickBetAmount={quickBetAmount}
                    onBet={handleBet}
                    onClick={() => setSelectedMarket(market)}
                    delay={(userMarkets.length + i) * 0.05}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Positions */}
        {view === 'positions' && (
          <div className="animate-in">
            <div style={{
              background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
              border: '1px solid var(--border)',
              padding: 24,
              marginBottom: 24,
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ ...s.mono(10), color: 'var(--text-muted)', marginBottom: 4 }}>TOTAL P&L</div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 48,
                  color: totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                }}>
                  {totalPnl >= 0 ? '+' : ''}{fmtUsd(totalPnl)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...s.mono(10), color: 'var(--text-muted)', marginBottom: 4 }}>OPEN POSITIONS</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 48 }}>{positions.length}</div>
              </div>
            </div>

            {positions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: 16 }}>
                  No positions yet
                </div>
                <button onClick={() => setView('markets')} style={s.btn('var(--accent-green)')}>
                  Browse Markets
                </button>
              </div>
            ) : (
              positions.map(pos => {
                const pnl = (pos.currentPrice / pos.entryPrice - 1) * pos.stake
                return (
                  <div key={pos.id} style={s.card()}>
                    <div style={s.cardQuestion}>{pos.question}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{
                          ...s.mono(10),
                          padding: '4px 10px',
                          background: pos.side === 'YES' ? 'var(--accent-green)' : 'var(--accent-red)',
                          color: '#000',
                        }}>
                          {pos.side}
                        </span>
                        <span style={s.mono(11)}>
                          ${fmtUsd(pos.stake)} @ {fmtCents(pos.entryPrice)}
                        </span>
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 24,
                        color: pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                      }}>
                        {pnl >= 0 ? '+' : ''}{fmtUsd(pnl)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Wallet */}
        {view === 'wallet' && (
          <div className="animate-in">
            {!isConnected ? (
              <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontStyle: 'italic', marginBottom: 20 }}>
                  Connect your wallet to continue
                </div>
                {activeChain === 'solana' ? (
                  <WalletMultiButton />
                ) : (
                  <button onClick={() => connect({ connector: connectors[0] })} style={s.btn('var(--accent-green)')}>
                    Connect Wallet
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Wallet Card */}
                <div style={{
                  background: activeChain === 'solana' 
                    ? 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)'
                    : 'linear-gradient(135deg, #0052FF 0%, #00D4FF 100%)',
                  padding: 24,
                  marginBottom: 16,
                }}>
                  <div style={{ ...s.mono(10), color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
                    {activeChain.toUpperCase()} WALLET
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, color: '#fff' }}>
                    {activeChain === 'solana' 
                      ? `${solanaBalance.toFixed(4)} SOL`
                      : `${baseUsdcBalance ? parseFloat(formatUnits(baseUsdcBalance.value, 6)).toFixed(2) : '0.00'} USDC`
                    }
                  </div>
                  <div style={{
                    ...s.mono(10),
                    marginTop: 16,
                    padding: '10px 14px',
                    background: 'rgba(0,0,0,0.3)',
                    color: 'rgba(255,255,255,0.8)',
                    wordBreak: 'break-all' as const,
                  }}>
                    {walletAddress}
                  </div>
                  <button
                    onClick={() => walletAddress && navigator.clipboard.writeText(walletAddress)}
                    style={{ ...s.btn('#fff'), marginTop: 12 }}
                  >
                    Copy Address
                  </button>
                </div>

                {/* Deposit */}
                <div style={{ ...s.card(), padding: 24 }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 8px 0' }}>
                    DEPOSIT TO POLYMARKET
                  </h3>
                  <p style={{ ...s.mono(11), marginBottom: 20 }}>
                    Send {activeChain === 'solana' ? 'SOL or USDC' : 'USDC on Base'} · Auto-bridges in 1-5 min
                  </p>
                  
                  {depositAddress ? (
                    <div style={{
                      padding: 16,
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--accent-green)',
                      wordBreak: 'break-all' as const,
                      ...s.mono(12),
                      color: 'var(--accent-green)',
                    }}>
                      {depositAddress}
                      <button
                        onClick={() => navigator.clipboard.writeText(depositAddress)}
                        style={{ ...s.btn('var(--accent-green)'), width: '100%', marginTop: 12 }}
                      >
                        Copy Deposit Address
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={getDepositAddress}
                      disabled={depositLoading}
                      style={{ ...s.btn('var(--accent-green)'), width: '100%', opacity: depositLoading ? 0.5 : 1 }}
                    >
                      {depositLoading ? 'Loading...' : 'Get Deposit Address'}
                    </button>
                  )}
                </div>

                {/* Trading Link */}
                <div style={{
                  ...s.card(),
                  padding: 24,
                  background: tradingReady 
                    ? 'linear-gradient(135deg, rgba(0,255,136,0.1) 0%, var(--bg-secondary) 100%)'
                    : 'var(--bg-secondary)',
                  borderColor: tradingReady ? 'var(--accent-green)' : 'var(--border)',
                }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 8px 0' }}>
                    {tradingReady ? '✓ TRADING ENABLED' : 'ENABLE TRADING'}
                  </h3>
                  <p style={{ ...s.mono(11), marginBottom: tradingReady ? 0 : 20 }}>
                    {tradingReady 
                      ? 'Your wallet is linked. Place orders on Polymarket.'
                      : 'One-time setup to place orders.'}
                  </p>
                  {!tradingReady && (
                    <button onClick={linkWalletForTrading} style={{ ...s.btn('var(--accent-green)'), width: '100%' }}>
                      Link Wallet for Trading
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Create */}
        {view === 'create' && (
          <div className="animate-in">
            <div style={{
              background: 'linear-gradient(135deg, rgba(255,215,0,0.2) 0%, var(--bg-secondary) 100%)',
              border: '1px solid var(--accent-gold)',
              padding: 20,
              marginBottom: 24,
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--accent-gold)' }}>
                BETA — USER MARKETS
              </div>
              <div style={{ ...s.mono(11), marginTop: 4 }}>
                Create markets for demo trading. Play money only.
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ ...s.mono(10), display: 'block', marginBottom: 8, color: 'var(--text-muted)' }}>
                MARKET QUESTION
              </label>
              <input
                type="text"
                value={newMarketQuestion}
                onChange={e => setNewMarketQuestion(e.target.value)}
                placeholder="Will [event] happen by [date]?"
                style={s.input}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ ...s.mono(10), display: 'block', marginBottom: 8, color: 'var(--text-muted)' }}>
                CATEGORY
              </label>
              <select
                value={newMarketCategory}
                onChange={e => setNewMarketCategory(e.target.value)}
                style={{ ...s.input, cursor: 'pointer' }}
              >
                <option value="">Select category...</option>
                <option value="crypto">Crypto</option>
                <option value="politics">Politics</option>
                <option value="sports">Sports</option>
                <option value="science">Science</option>
                <option value="entertainment">Entertainment</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ ...s.mono(10), display: 'block', marginBottom: 8, color: 'var(--text-muted)' }}>
                RESOLUTION DATE
              </label>
              <input
                type="date"
                value={newMarketEndDate}
                onChange={e => setNewMarketEndDate(e.target.value)}
                style={s.input}
              />
            </div>

            <button
              onClick={createUserMarket}
              disabled={!newMarketQuestion.trim() || !newMarketCategory || !newMarketEndDate}
              style={{
                ...s.btn('var(--accent-green)'),
                width: '100%',
                opacity: (newMarketQuestion.trim() && newMarketCategory && newMarketEndDate) ? 1 : 0.3,
                cursor: (newMarketQuestion.trim() && newMarketCategory && newMarketEndDate) ? 'pointer' : 'not-allowed',
              }}
            >
              Create Market
            </button>
          </div>
        )}
      </main>

      {/* Market Modal */}
      {selectedMarket && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => setSelectedMarket(null)}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: 500,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              maxHeight: '85vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
            className="animate-in"
          >
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>TRADE</span>
              <button 
                onClick={() => setSelectedMarket(null)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 24, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            
            <div style={{ padding: 24 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, lineHeight: 1.4, marginBottom: 16 }}>
                {selectedMarket.question}
              </div>
              
              <div style={{ display: 'flex', gap: 16, marginBottom: 24, ...s.mono(11) }}>
                <span>{fmtVol(selectedMarket.volume)} volume</span>
                {selectedMarket.endDate && <span>Closes {getTimeRemaining(selectedMarket.endDate)}</span>}
              </div>

              {/* Probability Display */}
              <div style={{
                display: 'flex',
                marginBottom: 24,
                border: '1px solid var(--border)',
              }}>
                <div style={{
                  flex: 1,
                  padding: 20,
                  background: 'rgba(0,255,136,0.05)',
                  borderRight: '1px solid var(--border)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, color: 'var(--accent-green)' }}>
                    {Math.round(selectedMarket.yesPrice * 100)}%
                  </div>
                  <div style={{ ...s.mono(10), color: 'var(--accent-green)' }}>YES</div>
                </div>
                <div style={{
                  flex: 1,
                  padding: 20,
                  background: 'rgba(255,51,102,0.05)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, color: 'var(--accent-red)' }}>
                    {Math.round(selectedMarket.noPrice * 100)}%
                  </div>
                  <div style={{ ...s.mono(10), color: 'var(--accent-red)' }}>NO</div>
                </div>
              </div>

              {/* Amount selector */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[10, 25, 50, 100].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setQuickBetAmount(amt)}
                    style={{
                      flex: 1,
                      ...s.mono(11),
                      padding: '12px',
                      background: quickBetAmount === amt ? 'var(--text-primary)' : 'var(--bg-tertiary)',
                      color: quickBetAmount === amt ? 'var(--bg-primary)' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    ${amt}
                  </button>
                ))}
              </div>

              {/* Trade buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button
                  onClick={() => {
                    handleBet(selectedMarket, 'YES', quickBetAmount)
                    setSelectedMarket(null)
                  }}
                  style={{
                    ...s.btn('var(--accent-green)'),
                    padding: '18px',
                    fontSize: 13,
                  }}
                >
                  BUY YES @ {fmtCents(selectedMarket.yesPrice)}
                </button>
                <button
                  onClick={() => {
                    handleBet(selectedMarket, 'NO', quickBetAmount)
                    setSelectedMarket(null)
                  }}
                  style={{
                    ...s.btn('var(--accent-red)'),
                    padding: '18px',
                    fontSize: 13,
                  }}
                >
                  BUY NO @ {fmtCents(selectedMarket.noPrice)}
                </button>
              </div>

              {/* Payout info */}
              <div style={{
                marginTop: 20,
                padding: 16,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={s.mono(10)}>IF YES WINS</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--accent-green)' }}>
                    ${(quickBetAmount / selectedMarket.yesPrice).toFixed(2)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={s.mono(10)}>POTENTIAL RETURN</span>
                  <span style={{ ...s.mono(12), color: 'var(--accent-green)' }}>
                    +{((1 / selectedMarket.yesPrice - 1) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Market Card
function MarketCard({ 
  market, 
  quickBetAmount, 
  onBet, 
  onClick,
  isUserCreated = false,
  delay = 0,
}: { 
  market: Market
  quickBetAmount: number
  onBet: (market: Market, side: 'YES' | 'NO', amount: number) => void
  onClick: () => void
  isUserCreated?: boolean
  delay?: number
}) {
  const yesPercent = Math.round(market.yesPrice * 100)
  
  return (
    <div
      onClick={onClick}
      className="animate-in"
      style={{
        padding: 20,
        marginBottom: 12,
        background: isUserCreated 
          ? 'linear-gradient(135deg, rgba(255,215,0,0.1) 0%, var(--bg-secondary) 100%)'
          : 'var(--bg-secondary)',
        border: isUserCreated ? '1px solid var(--accent-gold)' : '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        animationDelay: `${delay}s`,
        opacity: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent-green)'
        e.currentTarget.style.transform = 'translateX(4px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = isUserCreated ? 'var(--accent-gold)' : 'var(--border)'
        e.currentTarget.style.transform = 'translateX(0)'
      }}
    >
      {isUserCreated && (
        <div style={{ marginBottom: 10 }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.1em',
            background: 'var(--accent-gold)',
            color: '#000',
            padding: '3px 8px',
          }}>
            USER CREATED
          </span>
        </div>
      )}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 17,
            lineHeight: 1.4,
            color: 'var(--text-primary)',
            marginBottom: 10,
          }}>
            {market.question}
          </div>
          <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>{fmtVol(market.volume)} vol</span>
            {market.endDate && <span>{getTimeRemaining(market.endDate)}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 80 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 36,
            color: yesPercent >= 50 ? 'var(--accent-green)' : 'var(--text-secondary)',
            lineHeight: 1,
          }}>
            {yesPercent}%
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>YES</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 3,
        background: 'var(--bg-tertiary)',
        marginTop: 16,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${yesPercent}%`,
          height: '100%',
          background: 'linear-gradient(90deg, var(--accent-green) 0%, var(--accent-blue) 100%)',
          transition: 'width 0.3s',
        }} />
      </div>

      {/* Quick bet */}
      <div 
        style={{ display: 'flex', gap: 8, marginTop: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => onBet(market, 'YES', quickBetAmount)}
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.05em',
            padding: '12px',
            background: 'var(--accent-green)',
            color: '#000',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
        >
          YES {fmtCents(market.yesPrice)}
        </button>
        <button
          onClick={() => onBet(market, 'NO', quickBetAmount)}
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.05em',
            padding: '12px',
            background: 'var(--accent-red)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
        >
          NO {fmtCents(market.noPrice)}
        </button>
      </div>
    </div>
  )
}
