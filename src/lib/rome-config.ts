import { getChain, getTokens, getContracts, getPrograms } from "@rome-protocol/registry";
import deploymentsData from "./deployments.json";

export interface PoolCatalogEntry {
  poolId: number;
  symbolPair: string;
  tokenA: string;
  tokenB: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  splMintA: string;
  splMintB: string;
  solanaProgramName: string;
  solanaProgramId: string;
  solanaProgramHex32: `0x${string}`;
  feeBps: number;
  aprPercent: string;
  borshSwapDisc: `0x${string}`;
  borshLpDisc: `0x${string}`;
  spotPriceLabel: string;
  spotPriceUsdc: number;
}

export const JANUS_POOLS: PoolCatalogEntry[] = [
  {
    poolId: 0,
    symbolPair: "wSOL / wUSDC",
    tokenA: "0x39f36444FcB79B3e691544AEE2a832ebef54Ca9f",
    tokenB: "0xBCE339BA4c3a8De3bB8Af1c5539e6ac11dA3112D",
    tokenASymbol: "wSOL",
    tokenBSymbol: "wUSDC",
    splMintA: "So11111111111111111111111111111111111111112",
    splMintB: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    solanaProgramName: "Raydium CPMM (Atomic CPI)",
    solanaProgramId: "CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW",
    solanaProgramHex32: "0xa9525b9999e81040292f462739e25311c8a919002581d691915f0b7f4951b50a",
    feeBps: 25,
    aprPercent: "24.80%",
    borshSwapDisc: "0xf8c69e91e17587c8",
    borshLpDisc: "0xa9204f89a5634211",
    spotPriceLabel: "1 wSOL = 180.00 wUSDC",
    spotPriceUsdc: 180,
  },
  {
    poolId: 1,
    symbolPair: "wETH / wUSDC",
    tokenA: "0x02AEaCE038269f9961C93d04DcacD6FB3adFa55f",
    tokenB: "0xBCE339BA4c3a8De3bB8Af1c5539e6ac11dA3112D",
    tokenASymbol: "wETH",
    tokenBSymbol: "wUSDC",
    splMintA: "6F5YWWrUMNpee8C6BDUc6DmRvYRMDDTgJHwKhbXuifWs",
    splMintB: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    solanaProgramName: "Orca Whirlpool CLMM (Atomic CPI)",
    solanaProgramId: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    solanaProgramHex32: "0x0e0c249f03651b4506a2c44c9b224f1a1588f9e73f9f6351292241b9e66b3056",
    feeBps: 30,
    aprPercent: "19.45%",
    borshSwapDisc: "0xf8c69e91e17587c8",
    borshLpDisc: "0xa9204f89a5634211",
    spotPriceLabel: "1 wETH = 3,200.00 wUSDC",
    spotPriceUsdc: 3200,
  },
  {
    poolId: 2,
    symbolPair: "ARCV / wUSDC",
    tokenA: "0x2b13bA16A429BF630f94882e477Fe775D34b7C74",
    tokenB: "0xBCE339BA4c3a8De3bB8Af1c5539e6ac11dA3112D",
    tokenASymbol: "ARCV",
    tokenBSymbol: "wUSDC",
    splMintA: "ARCVMineralVaultSPLMint111111111111111111111",
    splMintB: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    solanaProgramName: "Meteora DAMM v1 (Atomic CPI)",
    solanaProgramId: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    solanaProgramHex32: "0x04bf8b5a044169c2556b461f29a8f15c0e92356a622a4e8f7b039d7b11234567",
    feeBps: 20,
    aprPercent: "31.20%",
    borshSwapDisc: "0xf8c69e91e17587c8",
    borshLpDisc: "0xa9204f89a5634211",
    spotPriceLabel: "1 ARCV = 1.20 wUSDC",
    spotPriceUsdc: 1.2,
  },
  {
    poolId: 3,
    symbolPair: "BPT2 / wUSDC",
    tokenA: "0x7d17492435a97762bf159cde400035246389139f",
    tokenB: "0xBCE339BA4c3a8De3bB8Af1c5539e6ac11dA3112D",
    tokenASymbol: "BPT2",
    tokenBSymbol: "wUSDC",
    splMintA: "BPT2BloomPoolSPLMint111111111111111111111111",
    splMintB: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    solanaProgramName: "Meteora DAMM v1 (Atomic CPI)",
    solanaProgramId: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    solanaProgramHex32: "0x04bf8b5a044169c2556b461f29a8f15c0e92356a622a4e8f7b039d7b11234567",
    feeBps: 15,
    aprPercent: "27.60%",
    borshSwapDisc: "0xf8c69e91e17587c8",
    borshLpDisc: "0xa9204f89a5634211",
    spotPriceLabel: "1 BPT2 = 1.00 wUSDC",
    spotPriceUsdc: 1.0,
  },
];

export const VERIFIED_BRIDGE_TRANSFERS = [
  {
    idx: 2,
    role: "Deployer (#2)",
    address: "0x17375DbD58B93746C7fa7693F93c7Beb75364161",
    transferId: "txf_e35082bab3c54a9cb489f82791def3dd",
    step1TxHash: "0xdf1e3f2808bb3807cf92803e5313f749d204aca174504cadf29ab4a21530db5d",
    route: "CCTP v2 (Sepolia -> Hadrian Gas)",
    amount: "10.00 USDC",
    status: "complete (all-gas)",
  },
  {
    idx: 4,
    role: "Trader 1 (#4)",
    address: "0x8170E7b22000527D9BAB38DFfA76B52103441B57",
    transferId: "txf_e86c26b8d5f04815bf00c0a2fa1714c7",
    step1TxHash: "0xd0e986b38e775a6da83ec44ac7f3e51ec844eaa5383d3ff996fd08a4ca1dccb6",
    route: "CCTP v2 (Sepolia -> Hadrian Gas)",
    amount: "10.00 USDC",
    status: "complete (all-gas)",
  },
  {
    idx: 5,
    role: "Trader 2 (#5)",
    address: "0x399995f606e9819a7dA3a1d21CAeC99ecF1E2B1a",
    transferId: "txf_d6d7d56034694e648bd3df89a3de1957",
    step1TxHash: "0xcffc689bfafff34e4063f0530c532b5a3ecd680d14a699d8cf1ad8968c8b08c0",
    route: "CCTP v2 (Sepolia -> Hadrian Gas)",
    amount: "10.00 USDC",
    status: "complete (all-gas)",
  },
];

export function resolveRomeNetwork(chainId: 200010 | 7531 = 200010) {
  const chain = getChain(chainId) as any;
  const tokens = (getTokens(chainId) as any[]) || [];
  const contracts = (getContracts(chainId) as any) || {};
  const programs = getPrograms(chainId === 7531 ? "mainnet" : "devnet") as any;

  if (chainId === 7531) {
    return {
      chainId: 7531,
      name: chain?.name || "Rome Rubicon Mainnet",
      rpcUrl: chain?.rpcUrl || "https://rubicon.mainnet.romeprotocol.xyz/",
      explorerUrl: chain?.explorerUrl || "https://via.mainnet.romeprotocol.xyz/",
      romeEvmProgramId: chain?.romeEvmProgramId || "RomePq9X3iAoTr813HR7uRarafFDUJty6GdiEceYpzX",
      gasSymbol: "ROME",
      solanaRpcUrl: "https://api.mainnet-beta.solana.com",
      contractAddress: deploymentsData.hadrian.contractAddress as `0x${string}`,
      erc20SplFactory: contracts.ERC20SPLFactory || "0x4068aa74f93e70e8297b25f89695a2a31b00ae6e",
      romeBridgeWithdraw: contracts.RomeBridgeWithdraw || "0xceea191753d161b6d1618082807a4959c0379c84",
      tokens,
      programs,
    };
  }

  return {
    chainId: 200010,
    name: chain?.name || "Rome Hadrian Testnet",
    rpcUrl: chain?.rpcUrl || "https://hadrian.testnet.romeprotocol.xyz/",
    explorerUrl: chain?.explorerUrl || "https://via-hadrian.testnet.romeprotocol.xyz/",
    romeEvmProgramId: chain?.romeEvmProgramId || "RPTWwELXAY4KC9ZPHhaxp7Sq1hHtU3HNEgLbSegCcWf",
    gasSymbol: "USDC",
    solanaRpcUrl: "https://api.devnet.solana.com",
    contractAddress: deploymentsData.hadrian.contractAddress as `0x${string}`,
    erc20SplFactory: contracts.ERC20SPLFactory || "0x37c13e4ff21fb914eb24014dcbd0f8dbeaa31078",
    romeBridgeWithdraw: contracts.RomeBridgeWithdraw || "0x6eeacb4e6006b7a29c8141f69b6c75346dedec73",
    tokens,
    programs,
  };
}
