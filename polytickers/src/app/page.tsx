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
  const { publicKey: solanaPublicKey, connected: isSolanaConnected } = useWallet()
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
  const [newMarketCategory, setNewMarketCategory] = useState('')
  const [newMarketEndDate, setNewMarketEndDate] = useState('')
  const [tradingReady, setTradingReady] = useState(false)

  const tradingBalance = isRealMoney 
    ? (activeChain === 'solana' ? solanaBalance * 100 : parseFloat(baseUsdcBalance ? formatUnits(baseUsdcBalance.value, 6) : '0'))
    : demoBal

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

  const handleBet = async (market: Market, side: 'YES' | 'NO', amount: number) => {
    if (!isConnected) {
      alert('Please connect wallet first')
      return
    }
    if (amount > tradingBalance) {
      alert('Insufficient balance')
      return
    }

    const outcome = side === 'YES' ? market.outcomes[0] : market.outcomes[1]
    const price = outcome.price
    const tokenId = side === 'YES' ? market.yesTokenId : market.noTokenId

    if (!isRealMoney) {
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
      setSelectedMarket(null)
      return
    }

    if (!tradingReady) {
      alert('Please link wallet for trading first')
      setView('wallet')
      return
    }

    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId, side: 'BUY', price, amount, walletAddress, chain: activeChain })
      })
      const data = await res.json()
      if (data.success) {
        setPositions(prev => [...prev, {
          id: Date.now(), marketId: market.id, question: market.question, side,
          stake: amount, entryPrice: price, currentPrice: price, tokenId: tokenId || '',
        }])
        setSelectedMarket(null)
        alert('Order placed!')
      } else {
        alert(`Order failed: ${data.error || 'Unknown error'}`)
      }
    } catch (e) {
      console.error('Trade error:', e)
      alert('Trade failed')
    }
  }

  const linkWalletForTrading = () => {
    if (!walletAddress) return
    localStorage.setItem(`trading_linked_${walletAddress}`, 'true')
    setTradingReady(true)
  }

  const totalPnl = positions.reduce((sum, p) => sum + ((p.currentPrice / p.entryPrice - 1) * p.stake), 0)

  // Today's date for masthead
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Masthead - Newspaper style */}
      <header style={{ 
        borderBottom: '3px double var(--ink)',
        padding: '16px 24px 12px',
        background: 'var(--paper)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Top line */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            fontSize: 11,
            fontFamily: 'var(--font-data)',
            color: 'var(--ink-faded)',
            marginBottom: 8,
            borderBottom: '1px solid var(--ink-faded)',
            paddingBottom: 8,
          }}>
            <span>{today}</span>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ 
                background: isRealMoney ? 'var(--forest)' : 'var(--gold)',
                color: isRealMoney ? 'var(--paper)' : 'var(--ink)',
                padding: '2px 8px',
                fontSize: 9,
                letterSpacing: '0.05em',
              }}>
                {isRealMoney ? 'LIVE TRADING' : 'PAPER TRADING'}
              </span>
              <span style={{ 
                background: activeChain === 'solana' ? '#9945FF' : 'var(--navy)',
                color: 'white',
                padding: '2px 8px',
                fontSize: 9,
              }}>
                {activeChain.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Masthead title */}
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <h1 style={{ 
              fontFamily: 'var(--font-display)', 
              fontSize: 48, 
              fontWeight: 900,
              letterSpacing: '-0.02em',
              margin: 0,
              lineHeight: 1,
            }}>
              POLYTICKERS
            </h1>
            <div style={{ 
              fontFamily: 'var(--font-body)', 
              fontStyle: 'italic',
              fontSize: 14,
              color: 'var(--ink-light)',
              marginTop: 4,
            }}>
              The Markets Never Sleep · Est. 2024
            </div>
          </div>

          {/* Account bar */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            borderTop: '1px solid var(--ink-faded)',
            paddingTop: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {isConnected && (
                <div style={{ fontFamily: 'var(--font-data)', fontSize: 13 }}>
                  <span style={{ color: 'var(--ink-faded)' }}>Balance: </span>
                  <span style={{ fontWeight: 600 }}>${fmtUsd(tradingBalance)}</span>
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <select
                value={activeChain}
                onChange={(e) => setActiveChain(e.target.value as 'solana' | 'base')}
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  padding: '6px 10px',
                  background: 'var(--paper)',
                  border: '1px solid var(--ink)',
                  cursor: 'pointer',
                }}
              >
                <option value="solana">Solana</option>
                <option value="base">Base</option>
              </select>

              {activeChain === 'solana' ? (
                <WalletMultiButton style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  height: 32,
                  background: isSolanaConnected ? '#9945FF' : 'var(--ink)',
                  color: 'var(--paper)',
                }} />
              ) : (
                isBaseConnected ? (
                  <button onClick={() => disconnectBase()} style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    padding: '6px 12px',
                    background: 'var(--navy)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                  }}>
                    {baseAddress?.slice(0, 6)}...
                  </button>
                ) : (
                  <button onClick={() => connect({ connector: connectors[0] })} style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    padding: '6px 12px',
                    background: 'var(--ink)',
                    color: 'var(--paper)',
                    border: 'none',
                    cursor: 'pointer',
                  }}>
                    Connect
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Status Banner - Make Paper vs Live very clear */}
      {isConnected && (
        <div style={{
          background: isRealMoney ? 'var(--forest)' : 'var(--gold)',
          color: isRealMoney ? 'var(--paper)' : 'var(--ink)',
          padding: '10px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ 
              fontFamily: 'var(--font-data)', 
              fontSize: 12, 
              fontWeight: 600,
              letterSpacing: '0.05em',
            }}>
              {isRealMoney ? '● LIVE MODE' : '◆ PAPER MODE'}
            </span>
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, opacity: 0.9 }}>
              {isRealMoney 
                ? tradingReady 
                  ? `Trading with real funds · ${activeChain === 'solana' ? solanaBalance.toFixed(4) + ' SOL' : parseFloat(baseUsdcBalance ? formatUnits(baseUsdcBalance.value, 6) : '0').toFixed(2) + ' USDC'}`
                  : 'Enable trading in Wallet tab to place real bets'
                : `Practice trading · $${fmtUsd(demoBal)} play money`}
            </span>
          </div>
          <button
            onClick={() => setIsRealMoney(!isRealMoney)}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              padding: '6px 16px',
              background: isRealMoney ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
              color: isRealMoney ? 'var(--paper)' : 'var(--ink)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Switch to {isRealMoney ? 'PAPER' : 'LIVE'}
          </button>
        </div>
      )}

      {/* Navigation - Tab style */}
      <nav style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 0,
        borderBottom: '2px solid var(--ink)',
        background: 'var(--paper-dark)',
      }}>
        {['markets', 'positions', 'wallet', 'create'].map(v => (
          <button
            key={v}
            onClick={() => setView(v as any)}
            style={{
              padding: '12px 32px',
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              letterSpacing: '0.1em',
              background: view === v ? 'var(--ink)' : 'transparent',
              color: view === v ? 'var(--paper)' : 'var(--ink)',
              border: 'none',
              borderBottom: view === v ? '3px solid var(--rust)' : '3px solid transparent',
              cursor: 'pointer',
              textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >
            {v}
            {v === 'positions' && positions.length > 0 && ` (${positions.length})`}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        
        {/* MARKETS VIEW */}
        {view === 'markets' && (
          <div className="fade-up">
            {/* Section header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-end',
              borderBottom: '2px solid var(--ink)',
              paddingBottom: 8,
              marginBottom: 20,
            }}>
              <div>
                <h2 style={{ 
                  fontFamily: 'var(--font-display)', 
                  fontSize: 28, 
                  fontWeight: 700,
                  margin: 0,
                }}>
                  Up/Down Markets
                </h2>
                <p style={{ 
                  fontFamily: 'var(--font-data)', 
                  fontSize: 11, 
                  color: 'var(--ink-faded)',
                  margin: '4px 0 0',
                }}>
                  {markets.length} crypto price markets · Live via Polymarket CLOB
                </p>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <span style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--ink-faded)', marginRight: 8, alignSelf: 'center' }}>
                  STAKE:
                </span>
                {[10, 25, 50, 100].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setQuickBetAmount(amt)}
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 10,
                      padding: '6px 10px',
                      background: quickBetAmount === amt ? 'var(--ink)' : 'transparent',
                      color: quickBetAmount === amt ? 'var(--paper)' : 'var(--ink)',
                      border: '1px solid var(--ink)',
                      cursor: 'pointer',
                    }}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {marketsLoading ? (
              <div style={{ 
                textAlign: 'center', 
                padding: 60, 
                fontFamily: 'var(--font-body)',
                fontStyle: 'italic',
                color: 'var(--ink-faded)',
              }}>
                Fetching the latest odds...
              </div>
            ) : markets.length === 0 && userMarkets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, background: 'var(--paper-dark)' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic' }}>No markets available</p>
                <button onClick={fetchMarkets} style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  padding: '10px 20px',
                  background: 'var(--ink)',
                  color: 'var(--paper)',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: 12,
                }}>
                  Refresh
                </button>
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
                    className={`fade-up stagger-${Math.min(i + 1, 6)}`}
                  />
                ))}
                {markets.map((market, i) => (
                  <MarketCard
                    key={market.id}
                    market={market}
                    quickBetAmount={quickBetAmount}
                    onBet={handleBet}
                    onClick={() => setSelectedMarket(market)}
                    className={`fade-up stagger-${Math.min(userMarkets.length + i + 1, 6)}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* POSITIONS VIEW */}
        {view === 'positions' && (
          <div className="fade-up">
            {/* P&L Summary */}
            <div style={{ 
              background: 'var(--ink)', 
              color: 'var(--paper)', 
              padding: 24, 
              marginBottom: 24,
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--ink-faded)', letterSpacing: '0.1em' }}>
                  TOTAL P&L
                </div>
                <div style={{ 
                  fontFamily: 'var(--font-display)', 
                  fontSize: 42, 
                  fontWeight: 700,
                  color: totalPnl >= 0 ? '#4ade80' : 'var(--rust)',
                }}>
                  {totalPnl >= 0 ? '+' : ''}{fmtUsd(totalPnl)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--ink-faded)', letterSpacing: '0.1em' }}>
                  OPEN
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 700 }}>
                  {positions.length}
                </div>
              </div>
            </div>

            {positions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, background: 'var(--paper-dark)', border: '1px dashed var(--ink-faded)' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', color: 'var(--ink-light)' }}>
                  No positions yet
                </p>
                <button onClick={() => setView('markets')} style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  padding: '10px 20px',
                  background: 'var(--ink)',
                  color: 'var(--paper)',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: 12,
                }}>
                  Browse Markets
                </button>
              </div>
            ) : (
              <div>
                {positions.map((pos, i) => {
                  const pnl = (pos.currentPrice / pos.entryPrice - 1) * pos.stake
                  return (
                    <div 
                      key={pos.id} 
                      className={`fade-up stagger-${Math.min(i + 1, 6)}`}
                      style={{ 
                        padding: 16, 
                        background: 'var(--paper)', 
                        borderLeft: `4px solid ${pos.side === 'YES' ? 'var(--forest)' : 'var(--rust)'}`,
                        marginBottom: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                    >
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, marginBottom: 8 }}>
                        {pos.question}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--ink-faded)' }}>
                          <span style={{
                            background: pos.side === 'YES' ? 'var(--forest)' : 'var(--rust)',
                            color: 'var(--paper)',
                            padding: '2px 6px',
                            marginRight: 8,
                          }}>
                            {pos.side}
                          </span>
                          ${fmtUsd(pos.stake)} @ {fmtCents(pos.entryPrice)}
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 20,
                          fontWeight: 600,
                          color: pnl >= 0 ? 'var(--forest)' : 'var(--rust)',
                        }}>
                          {pnl >= 0 ? '+' : ''}{fmtUsd(pnl)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* WALLET VIEW */}
        {view === 'wallet' && (
          <div className="fade-up">
            {!isConnected ? (
              <div style={{ textAlign: 'center', padding: 60, background: 'var(--paper-dark)', border: '1px dashed var(--ink-faded)' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic' }}>Connect to view your wallet</p>
                {activeChain === 'solana' ? (
                  <WalletMultiButton style={{ marginTop: 16 }} />
                ) : (
                  <button onClick={() => connect({ connector: connectors[0] })} style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 11,
                    padding: '12px 24px',
                    background: 'var(--ink)',
                    color: 'var(--paper)',
                    border: 'none',
                    cursor: 'pointer',
                    marginTop: 16,
                  }}>
                    Connect Wallet
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Wallet Card - This IS the deposit address */}
                <div style={{ 
                  background: activeChain === 'solana' 
                    ? 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)'
                    : 'linear-gradient(135deg, var(--navy) 0%, #0052FF 100%)',
                  color: 'white',
                  padding: 24,
                  marginBottom: 20,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, opacity: 0.8, letterSpacing: '0.1em' }}>
                        {activeChain.toUpperCase()} WALLET
                      </div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, marginTop: 8 }}>
                        {activeChain === 'solana' 
                          ? `${solanaBalance.toFixed(4)} SOL`
                          : `${baseUsdcBalance ? parseFloat(formatUnits(baseUsdcBalance.value, 6)).toFixed(2) : '0'} USDC`
                        }
                      </div>
                    </div>
                    <div style={{ 
                      background: 'rgba(255,255,255,0.2)', 
                      padding: '6px 12px',
                      fontFamily: 'var(--font-data)',
                      fontSize: 9,
                      letterSpacing: '0.05em',
                    }}>
                      DEPOSIT HERE ↓
                    </div>
                  </div>
                  
                  <div style={{ 
                    fontFamily: 'var(--font-data)',
                    fontSize: 11, 
                    marginTop: 16, 
                    background: 'rgba(0,0,0,0.3)', 
                    padding: '12px',
                    wordBreak: 'break-all',
                    borderRadius: 4,
                  }}>
                    {walletAddress}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={() => walletAddress && navigator.clipboard.writeText(walletAddress)} style={{
                      flex: 1,
                      fontFamily: 'var(--font-data)',
                      fontSize: 10,
                      padding: '10px 16px',
                      background: 'rgba(255,255,255,0.95)',
                      color: 'var(--ink)',
                      border: 'none',
                      cursor: 'pointer',
                    }}>
                      Copy Address
                    </button>
                    <button onClick={() => window.open(`https://${activeChain === 'solana' ? 'solscan.io/account/' : 'basescan.org/address/'}${walletAddress}`, '_blank')} style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 10,
                      padding: '10px 16px',
                      background: 'rgba(255,255,255,0.2)',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                    }}>
                      View Explorer ↗
                    </button>
                  </div>
                </div>

                {/* Deposit Instructions */}
                <div style={{ background: 'var(--paper-dark)', padding: 20, marginBottom: 16, border: '1px solid var(--ink-faded)' }}>
                  <div style={{ fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 600, marginBottom: 12, letterSpacing: '0.05em' }}>
                    HOW TO DEPOSIT
                  </div>
                  <ol style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink-light)', margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                    <li>Copy your wallet address above</li>
                    <li>Send {activeChain === 'solana' ? 'SOL or USDC' : 'ETH or USDC'} from any exchange or wallet</li>
                    <li>Funds appear in ~1-2 minutes</li>
                    <li>Enable live trading below to place real bets</li>
                  </ol>
                </div>

                {/* Trading Link */}
                <div style={{ 
                  background: tradingReady ? 'rgba(45,90,74,0.15)' : 'rgba(196,90,59,0.1)',
                  padding: 20,
                  border: `2px solid ${tradingReady ? 'var(--forest)' : 'var(--rust)'}`,
                }}>
                  <div style={{ fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
                    {tradingReady ? '✓ LIVE TRADING ENABLED' : 'ENABLE LIVE TRADING'}
                  </div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink-light)', marginBottom: 12 }}>
                    {tradingReady 
                      ? 'Your wallet is linked to Polymarket. Switch to LIVE mode to place real trades.'
                      : 'One-time authorization to trade on Polymarket with this wallet'}
                  </p>
                  {!tradingReady && (
                    <button onClick={linkWalletForTrading} style={{
                      width: '100%',
                      fontFamily: 'var(--font-data)',
                      fontSize: 11,
                      padding: '14px',
                      background: 'var(--forest)',
                      color: 'var(--paper)',
                      border: 'none',
                      cursor: 'pointer',
                    }}>
                      Enable Live Trading
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* CREATE VIEW - Chainlink Assets */}
        {view === 'create' && (
          <div className="fade-up">
            <div style={{ 
              background: 'rgba(201,162,39,0.15)',
              border: '2px solid var(--gold)',
              padding: 16,
              marginBottom: 24,
            }}>
              <div style={{ fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 600, color: 'var(--gold)' }}>
                CREATE UP/DOWN MARKET
              </div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink-light)', margin: '8px 0 0' }}>
                Launch a price prediction market for any Chainlink-supported asset
              </p>
            </div>

            {/* Asset Selection - Chainlink Feeds */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontFamily: 'var(--font-data)', fontSize: 10, display: 'block', marginBottom: 8, color: 'var(--ink-faded)', letterSpacing: '0.05em' }}>
                SELECT ASSET (CHAINLINK PRICE FEEDS)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { symbol: 'BTC', name: 'Bitcoin', icon: '₿' },
                  { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ' },
                  { symbol: 'SOL', name: 'Solana', icon: '◎' },
                  { symbol: 'BNB', name: 'BNB', icon: '⬡' },
                  { symbol: 'XRP', name: 'XRP', icon: '✕' },
                  { symbol: 'DOGE', name: 'Dogecoin', icon: 'Ð' },
                  { symbol: 'AVAX', name: 'Avalanche', icon: '▲' },
                  { symbol: 'LINK', name: 'Chainlink', icon: '⬡' },
                  { symbol: 'MATIC', name: 'Polygon', icon: '⬡' },
                ].map(asset => (
                  <button
                    key={asset.symbol}
                    onClick={() => setNewMarketCategory(asset.symbol)}
                    style={{
                      padding: '16px 12px',
                      fontFamily: 'var(--font-data)',
                      fontSize: 12,
                      background: newMarketCategory === asset.symbol ? 'var(--ink)' : 'var(--paper)',
                      color: newMarketCategory === asset.symbol ? 'var(--paper)' : 'var(--ink)',
                      border: '2px solid var(--ink)',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{asset.icon}</div>
                    <div style={{ fontWeight: 600 }}>{asset.symbol}</div>
                    <div style={{ fontSize: 9, color: newMarketCategory === asset.symbol ? 'var(--paper-dark)' : 'var(--ink-faded)' }}>
                      {asset.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Timeframe Selection */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontFamily: 'var(--font-data)', fontSize: 10, display: 'block', marginBottom: 8, color: 'var(--ink-faded)', letterSpacing: '0.05em' }}>
                TIMEFRAME
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { value: '1h', label: '1 Hour' },
                  { value: '4h', label: '4 Hours' },
                  { value: '24h', label: '24 Hours' },
                  { value: '7d', label: '1 Week' },
                ].map(tf => (
                  <button
                    key={tf.value}
                    onClick={() => setNewMarketEndDate(tf.value)}
                    style={{
                      padding: '14px',
                      fontFamily: 'var(--font-data)',
                      fontSize: 11,
                      background: newMarketEndDate === tf.value ? 'var(--ink)' : 'var(--paper)',
                      color: newMarketEndDate === tf.value ? 'var(--paper)' : 'var(--ink)',
                      border: '2px solid var(--ink)',
                      cursor: 'pointer',
                    }}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            {newMarketCategory && newMarketEndDate && (
              <div style={{ 
                background: 'var(--paper-dark)', 
                padding: 20, 
                marginBottom: 20,
                border: '1px solid var(--ink-faded)',
              }}>
                <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--ink-faded)', marginBottom: 8 }}>
                  MARKET PREVIEW
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 500 }}>
                  Will {newMarketCategory}/USD be higher in {newMarketEndDate === '1h' ? '1 hour' : newMarketEndDate === '4h' ? '4 hours' : newMarketEndDate === '24h' ? '24 hours' : '1 week'}?
                </div>
                <div style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--ink-faded)', marginTop: 8 }}>
                  Resolved via Chainlink {newMarketCategory}/USD Price Feed
                </div>
              </div>
            )}

            <button
              onClick={() => {
                if (!newMarketCategory || !newMarketEndDate) return
                const question = `Will ${newMarketCategory}/USD be higher in ${newMarketEndDate === '1h' ? '1 hour' : newMarketEndDate === '4h' ? '4 hours' : newMarketEndDate === '24h' ? '24 hours' : '1 week'}?`
                const endMs = newMarketEndDate === '1h' ? 60*60*1000 : newMarketEndDate === '4h' ? 4*60*60*1000 : newMarketEndDate === '24h' ? 24*60*60*1000 : 7*24*60*60*1000
                const newMarket: Market = {
                  id: `user-${Date.now()}`,
                  conditionId: `user-${Date.now()}`,
                  question,
                  slug: `${newMarketCategory.toLowerCase()}-updown-${newMarketEndDate}`,
                  description: `Resolved via Chainlink ${newMarketCategory}/USD Price Feed`,
                  image: null,
                  category: 'crypto',
                  endDate: new Date(Date.now() + endMs).toISOString(),
                  outcomes: [
                    { name: 'Up', price: 0.5, tokenId: `user-up-${Date.now()}` },
                    { name: 'Down', price: 0.5, tokenId: `user-down-${Date.now()}` },
                  ],
                  volume: 0, liquidity: 1000, yesPrice: 0.5, noPrice: 0.5, isUserCreated: true,
                }
                setUserMarkets(prev => [newMarket, ...prev])
                setNewMarketCategory('')
                setNewMarketEndDate('')
                setView('markets')
              }}
              disabled={!newMarketCategory || !newMarketEndDate}
              style={{
                width: '100%',
                padding: '16px',
                fontFamily: 'var(--font-data)',
                fontSize: 12,
                letterSpacing: '0.05em',
                background: (newMarketCategory && newMarketEndDate) ? 'var(--forest)' : 'var(--ink-faded)',
                color: 'var(--paper)',
                border: 'none',
                cursor: (newMarketCategory && newMarketEndDate) ? 'pointer' : 'not-allowed',
              }}
            >
              CREATE UP/DOWN MARKET
            </button>

            <div style={{ marginTop: 16, padding: 12, background: 'rgba(0,0,0,0.03)', fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--ink-faded)', textAlign: 'center' }}>
              Markets are resolved using Chainlink decentralized price oracles
            </div>
          </div>
        )}
      </main>

      {/* Modal */}
      {selectedMarket && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26,26,24,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => setSelectedMarket(null)}
        >
          <div 
            className="fade-up"
            style={{
              width: '100%',
              maxWidth: 480,
              background: 'var(--paper)',
              border: '3px solid var(--ink)',
              maxHeight: '85vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              background: 'var(--ink)',
              color: 'var(--paper)',
              padding: '12px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, letterSpacing: '0.1em' }}>TRADE</span>
              <button 
                onClick={() => setSelectedMarket(null)} 
                style={{ background: 'none', border: 'none', color: 'var(--paper)', fontSize: 20, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            
            <div style={{ padding: 24 }}>
              <h3 style={{ 
                fontFamily: 'var(--font-display)', 
                fontSize: 22, 
                fontWeight: 600,
                lineHeight: 1.3, 
                margin: '0 0 12px',
              }}>
                {selectedMarket.question}
              </h3>
              
              <div style={{ display: 'flex', gap: 16, marginBottom: 20, fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--ink-faded)' }}>
                <span>{fmtVol(selectedMarket.volume)} vol</span>
                {selectedMarket.endDate && <span>Closes {getTimeRemaining(selectedMarket.endDate)}</span>}
              </div>

              {/* Odds Display */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
                <div style={{
                  flex: 1,
                  padding: 20,
                  background: 'var(--forest)',
                  color: 'var(--paper)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 700 }}>
                    {Math.round(selectedMarket.yesPrice * 100)}%
                  </div>
                  <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.1em' }}>YES</div>
                </div>
                <div style={{
                  flex: 1,
                  padding: 20,
                  background: 'var(--rust)',
                  color: 'var(--paper)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 700 }}>
                    {Math.round(selectedMarket.noPrice * 100)}%
                  </div>
                  <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.1em' }}>NO</div>
                </div>
              </div>

              {/* Amount */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--ink-faded)', marginBottom: 8, letterSpacing: '0.05em' }}>
                  STAKE AMOUNT
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[10, 25, 50, 100].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setQuickBetAmount(amt)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        fontFamily: 'var(--font-data)',
                        fontSize: 11,
                        background: quickBetAmount === amt ? 'var(--ink)' : 'var(--paper)',
                        color: quickBetAmount === amt ? 'var(--paper)' : 'var(--ink)',
                        border: '2px solid var(--ink)',
                        cursor: 'pointer',
                      }}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trade buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button onClick={() => handleBet(selectedMarket, 'YES', quickBetAmount)} style={{
                  padding: 16,
                  background: 'var(--forest)',
                  color: 'var(--paper)',
                  border: 'none',
                  cursor: 'pointer',
                }}>
                  <div style={{ fontFamily: 'var(--font-data)', fontSize: 12, fontWeight: 600 }}>BUY YES</div>
                  <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, marginTop: 4, opacity: 0.8 }}>{fmtCents(selectedMarket.yesPrice)}</div>
                </button>
                <button onClick={() => handleBet(selectedMarket, 'NO', quickBetAmount)} style={{
                  padding: 16,
                  background: 'var(--rust)',
                  color: 'var(--paper)',
                  border: 'none',
                  cursor: 'pointer',
                }}>
                  <div style={{ fontFamily: 'var(--font-data)', fontSize: 12, fontWeight: 600 }}>BUY NO</div>
                  <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, marginTop: 4, opacity: 0.8 }}>{fmtCents(selectedMarket.noPrice)}</div>
                </button>
              </div>

              {/* Payout */}
              <div style={{ marginTop: 20, padding: 16, background: 'var(--paper-dark)', border: '1px solid var(--ink-faded)' }}>
                <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--ink-faded)' }}>POTENTIAL PAYOUT</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, color: 'var(--forest)' }}>
                  ${fmtUsd(quickBetAmount / Math.min(selectedMarket.yesPrice, selectedMarket.noPrice))}
                </div>
                <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--ink-faded)', marginTop: 4 }}>
                  {Math.round((1 / Math.min(selectedMarket.yesPrice, selectedMarket.noPrice) - 1) * 100)}% return if correct
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Market Card Component
function MarketCard({ 
  market, 
  quickBetAmount, 
  onBet, 
  onClick,
  isUserCreated = false,
  className = '',
}: { 
  market: Market
  quickBetAmount: number
  onBet: (market: Market, side: 'YES' | 'NO', amount: number) => void
  onClick: () => void
  isUserCreated?: boolean
  className?: string
}) {
  const yesPercent = Math.round(market.yesPrice * 100)
  
  return (
    <article
      onClick={onClick}
      className={className}
      style={{
        padding: 20,
        background: isUserCreated ? 'rgba(201,162,39,0.08)' : 'var(--paper)',
        borderLeft: isUserCreated ? '4px solid var(--gold)' : '4px solid var(--ink)',
        marginBottom: 16,
        cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateX(4px)'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateX(0)'
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'
      }}
    >
      {isUserCreated && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ 
            fontFamily: 'var(--font-data)',
            fontSize: 9, 
            background: 'var(--gold)', 
            color: 'var(--ink)', 
            padding: '2px 6px',
            letterSpacing: '0.05em',
          }}>
            USER MARKET
          </span>
        </div>
      )}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ 
            fontFamily: 'var(--font-body)', 
            fontSize: 17, 
            fontWeight: 400,
            margin: '0 0 10px',
            lineHeight: 1.4,
          }}>
            {market.question}
          </h3>
          <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--ink-faded)' }}>
            <span>{fmtVol(market.volume)} vol</span>
            {market.endDate && <span>{getTimeRemaining(market.endDate)}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 80 }}>
          <div style={{ 
            fontFamily: 'var(--font-display)', 
            fontSize: 32, 
            fontWeight: 700, 
            color: yesPercent >= 50 ? 'var(--forest)' : 'var(--ink-faded)',
            lineHeight: 1,
          }}>
            {yesPercent}%
          </div>
          <div style={{ fontFamily: 'var(--font-data)', fontSize: 9, color: 'var(--ink-faded)', letterSpacing: '0.05em' }}>
            YES
          </div>
        </div>
      </div>

      {/* Probability bar */}
      <div style={{ height: 3, background: 'var(--paper-dark)', marginTop: 16 }}>
        <div style={{ 
          width: `${yesPercent}%`, 
          height: '100%', 
          background: 'var(--forest)',
          transition: 'width 0.3s',
        }} />
      </div>

      {/* Quick bet buttons */}
      <div 
        style={{ display: 'flex', gap: 8, marginTop: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => onBet(market, 'YES', quickBetAmount)}
          style={{
            flex: 1,
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            padding: '10px',
            background: 'var(--forest)',
            color: 'var(--paper)',
            border: 'none',
            cursor: 'pointer',
            transition: 'filter 0.15s',
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
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            padding: '10px',
            background: 'var(--rust)',
            color: 'var(--paper)',
            border: 'none',
            cursor: 'pointer',
            transition: 'filter 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
        >
          NO {fmtCents(market.noPrice)}
        </button>
      </div>
    </article>
  )
}
