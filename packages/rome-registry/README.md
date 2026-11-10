# @rome-protocol/registry

> **Built on [Rome Protocol](https://docs.rome.builders)** — EVM chains that run natively inside the Solana runtime, where Solidity apps call Solana programs atomically (CPI) and Solana users drive EVM apps: two VMs, one chain, one block.


- **Single state** — EVM contracts and Solana programs share one state; no bridging or sync delay.
- **Atomic CPI access** — Solidity calls any Solana program directly (SPL Token, Meteora, …) inside one atomic transaction.
- **App Sovereignty** — each app runs its own EVM chain with a custom gas token and captures its own fee revenue.

Public chain metadata for [Rome](https://github.com/rome-protocol) — the canonical, machine-readable source for chain ids, RPC URLs, contract addresses, token catalogs, oracle feeds, Address Lookup Tables, app deployments, and Solana program ids. **Read it instead of hardcoding these values** in your app; they drift across deploys.

This package is a **generated, read-only projection** of Rome's registry — every field is public-safe by construction (an allowlist generator emits only what's meant to be public, substitutes internal endpoints for their public equivalents, and default-denies everything else). Do not hand-edit; changes come from the generator.

## Install

Consume this repo directly, pinned to a release tag (or a commit SHA):

```
npm install github:rome-protocol/rome-registry#v0.1.0
```

The package name stays `@rome-protocol/registry`, so imports are unchanged. Your lockfile pins the resolved commit; upgrade by bumping the tag. Release tags here are immutable.

For runtime fetch (browser, no install) use the jsDelivr CDN:

```
https://cdn.jsdelivr.net/gh/rome-protocol/rome-registry@v0.1.0/chains/200010-hadrian/chain.json
```

The repo is the canonical channel; an npm-registry publish may follow later.

## Usage

```js
import { getChain, getTokens, getContracts, getPrograms } from "@rome-protocol/registry";

const hadrian = getChain(200010);
// → { chainId, name, network, rpcUrl, explorerUrl, romeEvmProgramId,
//     nativeCurrency, solana: { cluster, explorerUrl, rpc } }

const rpc = hadrian.rpcUrl;                 // the chain's public RPC
const solanaRpc = hadrian.solana.rpc;       // a public Solana RPC for this chain's cluster

const tokens = getTokens(200010);           // gas token + wrapped assets (wUSDC/wETH/wSOL/…)
const factory = getContracts(200010)        // ERC20SPLFactory, Multicall3, …
  .find((c) => c.name === "ERC20SPLFactory");
const programs = getPrograms("devnet");     // name → Solana program id
```

### API

| Function | Returns |
|---|---|
| `listChains()` | every published chain's config |
| `getChain(chainId)` | one chain's config, or `null` |
| `getTokens(chainId)` | token catalog (gas + wrappers) |
| `getContracts(chainId)` | deployed contracts + live addresses |
| `getOracle(chainId)` | oracle factory + feed addresses |
| `getBridge(chainId)` | bridge wiring (CCTP / Wormhole) |
| `getAlts(chainId)` | persistent Address Lookup Tables |
| `getCompoundDeployment(chainId)` / `getAaveDeployment(chainId)` | per-app deployment config |
| `getPrograms(network)` | Solana program ids (`"mainnet"` / `"devnet"`) |
| `getLstMints()` | liquid-staking-token mint catalog |

## Published chains

The registry publishes Rome's public showcase chains. Each carries a public RPC and a public Solana RPC for its cluster.

## Building on Rome with an AI agent?

See [`AGENTS.md`](./AGENTS.md) — the Rome-specific rules a coding agent needs.

## License

MIT
