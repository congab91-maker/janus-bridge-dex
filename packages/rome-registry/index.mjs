// @rome-protocol/registry — isomorphic Rome chain metadata (Node + Browser/Webpack safe)

const CHAINS = {
  hadrian: {
    chain: {
      chainId: 200010,
      name: "Rome Hadrian",
      network: "testnet",
      rpcUrl: "https://hadrian.testnet.romeprotocol.xyz/",
      explorerUrl: "https://via-hadrian.testnet.romeprotocol.xyz/",
      romeEvmProgramId: "RPTWwELXAY4KC9ZPHhaxp7Sq1hHtU3HNEgLbSegCcWf",
      gasToken: {
        symbol: "USDC",
        name: "Rome Hadrian",
        decimals: 18,
        mintId: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
      }
    },
    tokens: [
      {
        address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        mintId: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        symbol: "USDC",
        name: "Rome Hadrian",
        decimals: 18,
        kind: "gas"
      },
      {
        address: "0xbce339ba4c3a8de3bb8af1c5539e6ac11da3112d",
        mintId: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        symbol: "wUSDC",
        name: "Rome USDC",
        decimals: 6,
        kind: "spl_wrapper"
      },
      {
        address: "0x02aeace038269f9961c93d04dcacd6fb3adfa55f",
        mintId: "6F5YWWrUMNpee8C6BDUc6DmRvYRMDDTgJHwKhbXuifWs",
        symbol: "wETH",
        name: "Rome ETH",
        decimals: 8,
        kind: "spl_wrapper"
      },
      {
        address: "0x39f36444fcb79b3e691544aee2a832ebef54ca9f",
        mintId: "So11111111111111111111111111111111111111112",
        symbol: "wSOL",
        name: "Rome SOL",
        decimals: 9,
        kind: "spl_wrapper"
      },
      {
        address: "0x2b13ba16a429bf630f94882e477fe775d34b7c74",
        symbol: "ARCV",
        name: "Mineral Vault I",
        decimals: 6,
        kind: "erc20"
      },
      {
        address: "0x7d17492435a97762bf159cde400035246389139f",
        symbol: "BPT2",
        name: "Bloom Pool Test 2",
        decimals: 6,
        kind: "erc20"
      },
      {
        address: "0xc29c49f68d56c4c4c8de88b49eeeeb98dc21bd7a",
        symbol: "RSDT",
        name: "Rome Short-Duration Treasury Fund",
        decimals: 18,
        kind: "erc20"
      },
      {
        address: "0xc4a9aa090cf4b2d500c8b7af3c6fe92aa6c8b7be",
        symbol: "FXS",
        name: "Fixture Sale",
        decimals: 6,
        kind: "erc20"
      },
      {
        address: "0xfd6b3b8fcd204120e31089c601b112843906535f",
        symbol: "FXG",
        name: "Fixture Gated",
        decimals: 6,
        kind: "erc20"
      }
    ],
    contracts: {
      ERC20SPLFactory: "0x37c13e4ff21fb914eb24014dcbd0f8dbeaa31078",
      RomeBridgeWithdraw: "0x6eeacb4e6006b7a29c8141f69b6c75346dedec73",
      RomeBridgePaymaster: "0xe5b515d69590044a994d88c8bb8a87b36cd7b6d2",
      Multicall3: "0xb7180d3c6514f90969db153c5918f084bd87ae4c",
      UniswapV3Factory: "0xD9E32308297585B263280B1253aB7A0dEEefD5bD",
      UniswapV4PoolManager: "0x8a281Be922dB55EE4a0200b7A80cE04714A707f7",
      MeteoraDAMMv1Factory: "0xd68b355f62643de0ec40243cba8f699f959ea3c4",
      OracleAdapterFactory: "0x52b008771fc95b4674a4f3533570b3d223f27f68"
    }
  },
  rubicon: {
    chain: {
      chainId: 7531,
      name: "Rome Rubicon Mainnet",
      network: "mainnet",
      rpcUrl: "https://rubicon.mainnet.romeprotocol.xyz/",
      explorerUrl: "https://via.mainnet.romeprotocol.xyz/",
      romeEvmProgramId: "RomePq9X3iAoTr813HR7uRarafFDUJty6GdiEceYpzX",
      gasToken: {
        symbol: "ROME",
        name: "Rome",
        decimals: 18
      }
    },
    tokens: [
      {
        address: "0x0952d23364095c2d9f3a8e196a1c85a08088f9b3",
        symbol: "wUSDC",
        name: "Rome USDC",
        decimals: 6,
        kind: "spl_wrapper"
      },
      {
        address: "0xc4e29e0f5b41522679786b9a59c419b4135ca113",
        symbol: "wSOL",
        name: "Rome SOL",
        decimals: 9,
        kind: "spl_wrapper"
      },
      {
        address: "0x01e8b357b451232d21515518e67e616b80e892e9",
        symbol: "wETH",
        name: "Rome ETH",
        decimals: 8,
        kind: "spl_wrapper"
      }
    ],
    contracts: {
      ERC20SPLFactory: "0x4068aa74f93e70e8297b25f89695a2a31b00ae6e",
      RomeBridgeWithdraw: "0xceea191753d161b6d1618082807a4959c0379c84",
      Multicall3: "0xd6e0b13e8f6185100357b06f2b3a9f3e2d31a759"
    }
  }
};

const PROGRAMS = {
  devnet: {
    splToken: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    splToken2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    associatedToken: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    systemProgram: "11111111111111111111111111111111",
    memo: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    wormholeCore: "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5",
    wormholeTokenBridge: "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe",
    cctpMessageTransmitter: "CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd",
    cctpTokenMessenger: "CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3",
    stakePool: "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy",
    marinade: "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD",
    raydiumAmmV4: "HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8",
    raydiumCpmm: "CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW",
    raydiumClmm: "devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH",
    meteoraDlmm: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    meteoraDammV1: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    meteoraDammV2: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
    orcaWhirlpool: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    phoenix: "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY",
    pumpFun: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    pumpSwap: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    mangoV4: "4MangoMjqJ2firMokCjjGgoK8d4MXcrgL7XJaL3w6fVg",
    driftV2: "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
    streamflow: "HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ",
    sns: "namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX",
    squadsV4: "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
    splGovernance: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
    jupiterV6: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
  },
  mainnet: {
    splToken: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    splToken2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    associatedToken: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    systemProgram: "11111111111111111111111111111111",
    memo: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    wormholeCore: "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth",
    wormholeTokenBridge: "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb",
    cctpMessageTransmitter: "CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd",
    cctpTokenMessenger: "CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3",
    stakePool: "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy",
    marinade: "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD",
    raydiumAmmV4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    raydiumCpmm: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    raydiumClmm: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
    meteoraDlmm: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    meteoraDammV1: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    meteoraDammV2: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
    orcaWhirlpool: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    phoenix: "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY",
    pumpFun: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    pumpSwap: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    kaminoLend: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
    kaminoFarms: "FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr",
    mangoV4: "4MangoMjqJ2firMokCjjGgoK8d4MXcrgL7XJaL3w6fVg",
    driftV2: "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
    marginfiV2: "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA",
    streamflow: "strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m",
    sns: "namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX",
    squadsV4: "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
    splGovernance: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
    jupiterV6: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
  }
};

export function listChains() {
  return Object.values(CHAINS).map((c) => c.chain);
}

function slugOf(chainIdOrSlug) {
  if (typeof chainIdOrSlug === "string" && CHAINS[chainIdOrSlug]) return chainIdOrSlug;
  for (const [slug, data] of Object.entries(CHAINS)) {
    if (data.chain.chainId === Number(chainIdOrSlug)) return slug;
  }
  return null;
}

export function getChain(chainId) {
  const s = slugOf(chainId);
  return s ? CHAINS[s].chain : null;
}

export function getTokens(chainId) {
  const s = slugOf(chainId);
  return s ? CHAINS[s].tokens : null;
}

export function getContracts(chainId) {
  const s = slugOf(chainId);
  return s ? CHAINS[s].contracts : null;
}

export function getPrograms(network) {
  return PROGRAMS[network] || {};
}

export function getLstMints() {
  return {};
}
