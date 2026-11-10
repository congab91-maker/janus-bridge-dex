# 🏛️ Janus DEX — Dual-Lane Unified AMM with Embedded Bridge Funding

**Janus DEX** is a flagship **Rome Builder Arena** decentralized exchange (`RomeDualLaneAMM.sol`) built natively for **Rome Protocol**. It implements the **Shared-State Parity Pattern** where both **EVM wallets (MetaMask)** and **Solana wallets (Solflare / Phantom)** trade and provide liquidity on the **exact same unified AMM pools**, complete with an embedded **Circle CCTP v2 & Wormhole Bridge Funding Interface** (`@rome-protocol/sdk/bridge`).

- **Live Production Website:** [https://janus-bridge-dex.vercel.app](https://janus-bridge-dex.vercel.app)
- **GitHub Repository:** [https://github.com/congab91-maker/janus-bridge-dex](https://github.com/congab91-maker/janus-bridge-dex)
- **Hadrian Testnet Contract (`200010`):** [`0x33ea358c67e61aa57bf20047184453ffaf72c20a`](https://via-hadrian.testnet.romeprotocol.xyz/address/0x33ea358c67e61aa57bf20047184453ffaf72c20a)
- **Contract Deployment Tx:** [`0xd9ed08ed1bd046f130a6ca62b8a22ed045efac6a5079af67ba9ded90f3e9391e`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xd9ed08ed1bd046f130a6ca62b8a22ed045efac6a5079af67ba9ded90f3e9391e)
- **DEX External-Authority PDA (`HELPER.pda`):** `0x24f711736cea83d9b7421c9d11ebe78b6c96a07013cf3a9dc2f2f55dd2b2a358`

---

## ⚡ Core Architecture & Rome-Native Differentiators

1. **Shared-State Unified Liquidity Pools (`RomeDualLaneAMM.sol`):**
   - Unlike fragmented cross-chain DEXs, Janus DEX maintains a single source of truth on Rome EVM where SPL tokens and their ERC-20 wrappers (`wSOL`, `wUSDC`, `wETH`, `ARCV`, `BPT2`) point to the same underlying account via `ERC20SPLFactory` (`0x37c13e4ff21fb914eb24014dcbd0f8dbeaa31078`).
   - MetaMask users (`submitRomeTx`) and Solana wallet users (`submitRomeTxV1` synthetic sender) swap and provide liquidity against the same constant-product ($x \cdot y = k$) reserves.
2. **Atomic Solana Cross-Program Invocation (`0xFF...08` & `0xFF...09`):**
   - Every pool creation, liquidity provision, and swap invokes Rome's `ICrossProgramInvocation` (`0xFF00000000000000000000000000000000000008`) and `IHelperProgram` (`0xff00000000000000000000000000000000000009`) precompiles atomically within a single ~400ms Solana transaction.
   - Enforces all Rome CPI safety invariants: non-empty `AccountMeta[]`, exclusion of target `programId` and `SYSTEM.operator()` (`0xfF...07`) from `AccountMeta[]`, and `cpiDepth <= 4`.
3. **Embedded Bridge Funding Interface (`@rome-protocol/sdk/bridge`):**
   - Integrates `inboundCctpQuoteRequest`, `inboundWhQuoteRequest`, `outboundCctpQuoteRequest`, `outboundWhQuoteRequest`, and `RomeBridgeWithdraw` (`0x6eeacb4e6006b7a29c8141f69b6c75346dedec73`) so users can onboard USDC gas or wETH and immediately trade.

---

## 🔗 Live On-Chain Verification Matrix (Hadrian Testnet `200010`)

| # | Action | Pool / Target | Wallet Role | Sender Address | Hadrian EVM Tx Hash | Solana Settlement Signature |
|---|--------|---------------|-------------|----------------|---------------------|-----------------------------|
| **Deploy** | **Deploy `RomeDualLaneAMM.sol`** | Hadrian (`200010`) | Deployer (#2) | `0x17375DbD58B93746C7fa7693F93c7Beb75364161` | [`0xd9ed08ed...f3e9391e`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xd9ed08ed1bd046f130a6ca62b8a22ed045efac6a5079af67ba9ded90f3e9391e) | `44c6T5PnHqZi2g6CgUuKcLc1nE5EKdxxskCzpcwPBGjYhT3J4LnaMtZf7J1dGCpo97UzuaJSenFXpkSEoPH9oJBk` |
| **PDA** | **Provision DEX PDA (`HELPER.create_pda`)** | `0xFF...09` | Deployer (#2) | `0x17375DbD58B93746C7fa7693F93c7Beb75364161` | [`0xb8115a87...f4af23ae`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xb8115a87d28bc69838a72d752ad3cd3e0c4ccfdf064fdee84ae59544f4af23ae) | Atomic PDA Init |
| **1** | **Create Unified Pool (`createUnifiedPool`)** | `BPT2 / wUSDC` | Deployer (#2) | `0x17375DbD58B93746C7fa7693F93c7Beb75364161` | [`0x27be470a...d5882cf6`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x27be470a4669c6a715268e78bae5a186acdc29c9dbf7e3c76e6924fdd5882cf6) | `3qDy9rxQrcY9EQVAoNRskbC7me6jjXPD8VhHg5M5RPDjiw9iHcNscpRKHKwbMXSKLbBa1UmLjsbSpyGd2sqNjTiq` |
| **2** | **Add Unified Liquidity (EVM Lane)** | `wSOL / wUSDC` | Trader 1 (#4) | `0x8170E7b22000527D9BAB38DFfA76B52103441B57` | [`0xc7b661e0...18714b4d`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xc7b661e0a1544b7fef75a1e81d06417737464f7b5a71654fde803d6718714b4d) | `3rBMN1QRgfWwb8XogEPjCVYc7bBc6bMsm2mYP9t661zF1QDwck7Hrc4jrU7gkDnwG9k9EyyrjGCAp2pGQmJB4LhN` |
| **3** | **Add Unified Liquidity (Solana Synthetic Lane)** | `wSOL / wUSDC` | Trader 2 (#5) | `0x399995f606e9819a7dA3a1d21CAeC99ecF1E2B1a` | [`0x4400aa87...ea27bc92`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x4400aa87b20e5d506387f7347aa5b75ed623a23e39798d6a57d6152cea27bc92) | `3RqHLBqp4evSsBr5LEqTaDCfFEVDARpmUm3EHrQkPN1MPgTUMjKRBxVfTMwFhqxUFQ9RgECRmTrGtiDGbEmB5WcA` |
| **4** | **Atomic Constant-Product CPI Swap (`wUSDC -> wSOL`)** | `wSOL / wUSDC` | Trader 1 (#4) | `0x8170E7b22000527D9BAB38DFfA76B52103441B57` | [`0x6311df65...9fadbd25`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x6311df65832ebd8feccc57f909fc5cd4c890a833a5d919217293351f9fadbd25) | `3TNvg52xyFWWCmamgJtk8CjfCvs8fQcfgJKtrfE3bsWWbQXkF8TcXnk6yq5Pzc2nyLqKHdk2vV48DtpzHgn68Myy` |
| **5** | **Dual-Lane Solana Synthetic Swap (`wUSDC -> wETH`)** | `wETH / wUSDC` | Trader 2 (#5) | `0x399995f606e9819a7dA3a1d21CAeC99ecF1E2B1a` | [`0x4e61e2dd...5b84f17f`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x4e61e2dd448ec471e0514f0c71545763a6e245bcf73c00a9e0b06c705b84f17f) | `4wzMipQao2r2Rq1WZTb2Xjm83WtCAHTjjVsKd5dvjBb3bExh2X9844Er7tnqqWXpUrKe8KhvwLKQkRyj91WznaS7` |
| **6** | **Sync CCTP Bridge Funding Route (`RomeBridgeWithdraw`)** | CCTP v2 | Trader 1 (#4) | `0x8170E7b22000527D9BAB38DFfA76B52103441B57` | [`0x9bae2a44...cf97abbf`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x9bae2a44d49d8f5dfc006ae6120d683140d33141eb170ecf373abfc3cf97abbf) | `5dsnqXmLzUpSzsAsjNgTrHMR3f5vjYdarKtGdgd8tCpuqJyzgg2qYbYxVzVnJKrXDd9woptgAvkfGsHFSNgzH6mm` |
| **7** | **Direct Custom Solana Program CPI (`0xFF..08`)** | SPL Memo v2 | Trader 2 (#5) | `0x399995f606e9819a7dA3a1d21CAeC99ecF1E2B1a` | [`0x8ea5bc81...9af5631b`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x8ea5bc81d24540254f162f26f8a3ac8fd837bc9b6339384f687b48c29af5631b) | `jMWZaWDpvqaNz56oFJMdEjnFw2v6ZtX9Et3c3vvSViCcoa7kjyGLUo7Lf6N36Wd1ippa9fcuq91KortERJQytj1` |

---

## 🛠️ Quick Start & Verification

```bash
# Install dependencies
npm install

# Compile contracts & run full EVM + Precompile unit test suite (7/7 passing)
npm run test:contracts

# TypeScript check & production Next.js build
npm run typecheck
npm run build

# Start local development server
npm run dev
```
