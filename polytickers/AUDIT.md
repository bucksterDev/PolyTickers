# Polytickers Codebase Audit - Senior Web3 SWE Review

## CHANGES MADE (v0.3.0)

### Switched from Mayan to LiFi
- LiFi has official Turnkey integration example
- Better documentation and SDK
- Integrator fee support (up to 1%)
- Same bridges under the hood (Mayan, Wormhole, CCTP, etc.)

### Revenue: Integrator Fees
```env
LIFI_INTEGRATOR=polytickers
LIFI_FEE=0.003  # 0.3% = 30 bps
```
- Register at https://li.fi/partner-portal
- Fees collected automatically by LiFi
- Example: $1000 bridge at 0.3% = $3.00 to you

---

## CRITICAL ISSUES (FIXED)

### 1. **TurnkeyEthersSigner.ts** - Line 50: primaryType determination is fragile
```typescript
primaryType: Object.keys(typesWithoutDomain)[0],
```
**ISSUE**: Object.keys() order is not guaranteed. For complex EIP-712 structs with multiple types, this could pick the wrong primary type.
**FIX**: The ClobClient should pass primaryType explicitly, but since Polymarket always uses "Order" or "ApiCredential" as primary types, this works in practice. Still, should be more explicit.

### 2. **usePolymarketTrading.ts** - Line 77: Using EOA directly instead of Safe
```typescript
const safeAddress = eoaAddress // Simplified - use EOA as funder
```
**ISSUE**: Trading directly from EOA means:
- User pays gas for approvals/transactions
- No batched transactions
- Missing gasless trading benefit
**FIX**: Need to deploy Safe proxy using RelayClient for production

### 3. **usePolymarketTrading.ts** - Line 83: localStorage for credentials is XSS vulnerable
```typescript
localStorage.setItem(`polymarket_creds_${eoaAddress}`, JSON.stringify(userApiCreds))
```
**ISSUE**: API credentials in localStorage can be stolen via XSS
**FIX**: For production, use httpOnly cookies or server-side session

### 4. **usePolymarketTrading.ts** - Line 177: Wrong signatureType for EOA
```typescript
0, // signatureType = 0 for EOA direct
```
**ISSUE**: signatureType=0 is correct for EOA, but we're calling it "safeAddress" which is confusing
**FIX**: Rename variable or actually deploy Safe

### 5. **usePolymarketTrading.ts** - Line 197: negRisk hardcoded to false
```typescript
{ negRisk: false },
```
**ISSUE**: Some Polymarket markets ARE negRisk markets. This will fail for those.
**FIX**: Need to fetch market metadata and pass correct negRisk flag

### 6. **bridge/route.ts** - Line 52-67: No referrer fee collection
**ISSUE**: Not taking any bps from bridges = leaving money on table
**FIX**: Add referrer address and referrerBps to quote request

### 7. **bridge/route.ts** - No actual bridge execution
**ISSUE**: POST route doesn't actually execute the bridge - just returns instructions
**FIX**: Need to implement actual Mayan SDK bridge execution with Turnkey signing

### 8. **markets/route.ts** - Line 67-68: Missing tokenIds sometimes
```typescript
tokenIds = m.clobTokenIds || []
```
**ISSUE**: Some markets don't have clobTokenIds, causing trading to fail silently
**FIX**: Add validation, skip markets without tokenIds in real mode

### 9. **page.tsx** - Line 246: Assuming outcomes[0] is YES
```typescript
const outcome = side === 'YES' ? market.outcomes[0] : market.outcomes[1]
```
**ISSUE**: Gamma API doesn't guarantee YES is always first
**FIX**: Need to check outcome.name === 'Yes' explicitly

### 10. **page.tsx** - Line 282: Size calculation may cause dust issues
```typescript
size: amount / price, // Convert USD amount to shares
```
**ISSUE**: Polymarket has minimum order sizes and tick sizes. Raw division may create invalid orders.
**FIX**: Round to valid tick size (typically 0.01)

### 11. **No token approvals before trading**
**ISSUE**: User needs to approve USDC.e spending before placing orders
**FIX**: Need approval flow or use RelayClient for gasless approvals

### 12. **No withdraw/reverse bridge implementation**
**ISSUE**: Users can deposit but can't withdraw back to Solana
**FIX**: Implement Polygon → Solana bridge (Mayan supports this)

---

## MODERATE ISSUES

### 13. **balance/route.ts** - No retry/fallback for RPC calls
Mainnet RPCs can fail. Should add retry logic or multiple RPC endpoints.

### 14. **markets/route.ts** - Still references DOME_API_KEY
We removed Dome but the fallback code still checks for it.

### 15. **providers.tsx** - No wallet creation config
When user creates wallet, we should specify we want both Solana + Ethereum accounts.

### 16. **page.tsx** - No loading states for trading
When placeOrder is executing, user can click multiple times.

### 17. **No position tracking from chain**
Positions are only tracked locally - should fetch from Polymarket API.

### 18. **No gas estimation before bridge**
User should see estimated fees before confirming bridge.

---

## MISSING FEATURES

1. **Actual bridge execution with Turnkey Solana signing**
2. **Reverse bridge (Polygon → Solana) for withdrawals**
3. **Referrer fee collection (up to 50 bps)**
4. **Token approval flow**
5. **Safe proxy deployment for gasless trading**
6. **Position sync from Polymarket API**
7. **Order status tracking**
8. **Slippage protection**

---

## REVENUE OPPORTUNITY

Mayan allows up to **50 bps (0.5%)** referrer fees:
- Default: 10 bps (0.1%)
- Max: 50 bps (0.5%)

Example: User bridges $1000 SOL → USDC
- At 25 bps: $2.50 fee to us
- At 50 bps: $5.00 fee to us

**Implementation**: Add `referrer` and `referrerBps` to quote requests.

---

## IMPLEMENTATION PLAN

### Phase 1: Fix Critical Issues
1. Fix outcome ordering (check name, not index)
2. Fix negRisk detection
3. Add token approval check/flow
4. Round order sizes to valid ticks

### Phase 2: Implement Real Bridging
1. Integrate Mayan SDK properly
2. Add Turnkey Solana transaction signing
3. Add referrer fees (25 bps recommended)
4. Track bridge status

### Phase 3: Implement Withdrawals
1. Polygon USDC → Solana bridge
2. SOL/USDC withdrawal options

### Phase 4: Production Hardening
1. Move credentials to secure storage
2. Deploy Safe proxy for gasless trading
3. Add proper error handling
4. Add retry logic for RPCs
