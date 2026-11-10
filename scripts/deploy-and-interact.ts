import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseEther,
  formatEther,
  toHex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { getChain, getTokens, getContracts, getPrograms } from "@rome-protocol/registry";
import { submitRomeTx } from "@rome-protocol/sdk";
import { compileContracts } from "./compile";

dotenv.config();

const HADRIAN_CHAIN_ID = 200010;
const RUBICON_CHAIN_ID = 7531;

/** Build an EIP-1193 provider from a viem account + Rome RPC URL so submitRomeTx works in Node scripts. */
function createEip1193Provider(account: PrivateKeyAccount, rpcUrl: string, chainId: number) {
  const wallet = createWalletClient({ account, transport: http(rpcUrl, { timeout: 120_000 }) });

  return {
    async request({ method, params = [] }: { method: string; params?: any[] }): Promise<any> {
      if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account.address];
      if (method === "eth_sendTransaction") {
        const tx = params[0] || {};
        const hash = await wallet.sendTransaction({
          account,
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : 0n,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
          maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : undefined,
          chain: {
            id: chainId,
            name: `rome-${chainId}`,
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: { default: { http: [rpcUrl] } },
          },
        });
        return hash;
      }
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }).then((r) => r.json());
      if (res.error) {
        throw new Error(res.error.message || JSON.stringify(res.error));
      }
      return res.result;
    },
  };
}

async function getSolanaSettlementSignatures(rpcUrl: string, evmTxHash: string): Promise<string[]> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "rome_solanaTxForEvmTx",
        params: [evmTxHash],
      }),
    }).then((r) => r.json());
    return Array.isArray(res?.result) ? res.result : [];
  } catch {
    return [];
  }
}

async function main() {
  console.log("🚀 Starting Janus DEX (RomeDualLaneAMM) Deployment & On-Chain Interaction...");

  const compiled = compileContracts();
  const ammArtifact = compiled["RomeDualLaneAMM"];

  const hadrian = getChain(HADRIAN_CHAIN_ID) as any;
  const hadrianTokens = getTokens(HADRIAN_CHAIN_ID) as any;
  const hadrianContracts = getContracts(HADRIAN_CHAIN_ID) as any;
  const devnetPrograms = getPrograms("devnet") as any;
  const mainnetPrograms = getPrograms("mainnet") as any;

  const erc20SplFactoryAddr =
    hadrianContracts?.ERC20SPLFactory || "0x37c13e4ff21fb914eb24014dcbd0f8dbeaa31078";
  const romeBridgeWithdrawAddr =
    hadrianContracts?.RomeBridgeWithdraw || "0x6eeacb4e6006b7a29c8141f69b6c75346dedec73";

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  const trader1Key = process.env.TRADER1_PRIVATE_KEY as `0x${string}`;
  const trader2Key = process.env.TRADER2_PRIVATE_KEY as `0x${string}`;

  if (!deployerKey || !trader1Key || !trader2Key) {
    throw new Error("Missing DEPLOYER_PRIVATE_KEY, TRADER1_PRIVATE_KEY, or TRADER2_PRIVATE_KEY in .env");
  }

  const deployer = privateKeyToAccount(deployerKey);
  const trader1 = privateKeyToAccount(trader1Key);
  const trader2 = privateKeyToAccount(trader2Key);

  const pub = createPublicClient({ transport: http(hadrian.rpcUrl, { timeout: 120_000 }) });
  const deployerWallet = createWalletClient({ account: deployer, transport: http(hadrian.rpcUrl, { timeout: 120_000 }) });

  let [bDeployer, bTrader1, bTrader2] = await Promise.all([
    pub.getBalance({ address: deployer.address }),
    pub.getBalance({ address: trader1.address }),
    pub.getBalance({ address: trader2.address }),
  ]);

  console.log(`📊 Hadrian Testnet (${HADRIAN_CHAIN_ID}) Selected Wallet Balances:`);
  console.log(`   Deployer (${deployer.address}): ${formatEther(bDeployer)} USDC`);
  console.log(`   Trader 1 (${trader1.address}): ${formatEther(bTrader1)} USDC`);
  console.log(`   Trader 2 (${trader2.address}): ${formatEther(bTrader2)} USDC`);

  // Ensure Deployer has ~22+ USDC for iterative contract creation on Hadrian
  if (bDeployer < parseEther("22")) {
    console.log("   🔄 Consolidating USDC gas to Deployer for contract creation headroom...");
    if (process.env.TREASURY_PRIVATE_KEY) {
      const treasury = privateKeyToAccount(process.env.TREASURY_PRIVATE_KEY as `0x${string}`);
      const bTreasury = await pub.getBalance({ address: treasury.address });
      if (bTreasury > parseEther("6.5")) {
        const treasuryProvider = createEip1193Provider(treasury, hadrian.rpcUrl, HADRIAN_CHAIN_ID);
        const topupHash = await submitRomeTx(treasuryProvider, {
          from: treasury.address,
          to: deployer.address,
          data: "0x",
          value: parseEther("6.0"),
        });
        await pub.waitForTransactionReceipt({ hash: topupHash, timeout: 60_000 });
        console.log(`   ✅ Topped up 6.0 USDC from Treasury (${treasury.address}) -> Tx: ${topupHash}`);
      }
    }
    if (bTrader1 > parseEther("7.5")) {
      const t1Provider = createEip1193Provider(trader1, hadrian.rpcUrl, HADRIAN_CHAIN_ID);
      const t1Topup = await submitRomeTx(t1Provider, {
        from: trader1.address,
        to: deployer.address,
        data: "0x",
        value: parseEther("4.0"),
      });
      await pub.waitForTransactionReceipt({ hash: t1Topup, timeout: 60_000 });
      console.log(`   ✅ Topped up 4.0 USDC from Trader 1 (${trader1.address}) -> Tx: ${t1Topup}`);
    }
    if (bTrader2 > parseEther("7.5")) {
      const t2Provider = createEip1193Provider(trader2, hadrian.rpcUrl, HADRIAN_CHAIN_ID);
      const t2Topup = await submitRomeTx(t2Provider, {
        from: trader2.address,
        to: deployer.address,
        data: "0x",
        value: parseEther("4.0"),
      });
      await pub.waitForTransactionReceipt({ hash: t2Topup, timeout: 60_000 });
      console.log(`   ✅ Topped up 4.0 USDC from Trader 2 (${trader2.address}) -> Tx: ${t2Topup}`);
    }
    bDeployer = await pub.getBalance({ address: deployer.address });
    console.log(`   💰 Updated Deployer Balance: ${formatEther(bDeployer)} USDC`);
  }

  // 1. Deploy RomeDualLaneAMM on Hadrian Testnet (200010)
  console.log("\n📦 Deploying RomeDualLaneAMM.sol to Hadrian Testnet (200010)...");
  const gasPrice = await pub.getGasPrice();
  const deployTxHash = await deployerWallet.deployContract({
    abi: ammArtifact.abi,
    bytecode: ammArtifact.bytecode,
    args: [erc20SplFactoryAddr, romeBridgeWithdrawAddr],
    account: deployer,
    chain: null,
    gas: 80_000_000n,
    maxFeePerGas: (gasPrice * 11n) / 10n,
    maxPriorityFeePerGas: 0n,
  });

  console.log(`   Deploy Tx Hash: ${deployTxHash}`);
  const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployTxHash, timeout: 120_000 });
  if (!deployReceipt.contractAddress) {
    throw new Error("Contract deployment failed — no contractAddress in receipt");
  }
  const contractAddress = deployReceipt.contractAddress;
  const deploySolanaSigs = await getSolanaSettlementSignatures(hadrian.rpcUrl, deployTxHash);

  console.log(`✅ RomeDualLaneAMM deployed at: ${contractAddress}`);
  console.log(`   Explorer: ${hadrian.explorerUrl}address/${contractAddress}`);

  const deployerProvider = createEip1193Provider(deployer, hadrian.rpcUrl, HADRIAN_CHAIN_ID);
  const trader1Provider = createEip1193Provider(trader1, hadrian.rpcUrl, HADRIAN_CHAIN_ID);
  const trader2Provider = createEip1193Provider(trader2, hadrian.rpcUrl, HADRIAN_CHAIN_ID);

  // Activate DEX External-Authority PDA in a dedicated single atomic Solana transaction
  console.log("\n🔑 Provisioning DEX External-Authority PDA via HELPER.create_pda (0xFF..09)...");
  const activatePdaData = encodeFunctionData({
    abi: ammArtifact.abi,
    functionName: "activateDexPda",
    args: [],
  });
  const activatePdaHash = await submitRomeTx(deployerProvider, {
    from: deployer.address,
    to: contractAddress,
    data: activatePdaData,
    minGas: 5_000_000n,
  });
  await pub.waitForTransactionReceipt({ hash: activatePdaHash, timeout: 120_000 });
  console.log(`   ✅ DEX PDA Provisioned! Tx: ${activatePdaHash}`);

  // Query on-chain dexAuthorityPda from Helper Precompile (0xFF..09)
  const dexPda = (await pub.readContract({
    address: contractAddress,
    abi: ammArtifact.abi,
    functionName: "dexAuthorityPda",
  })) as `0x${string}`;
  console.log(`🔑 On-Chain DEX External-Authority PDA (HELPER.pda): ${dexPda}`);

  const transactions: Array<{
    id: number;
    action: string;
    poolPair: string;
    lane: string;
    walletRole: string;
    sender: string;
    amountUsdc: string;
    txHash: string;
    explorerUrl: string;
    solanaSignatures: string[];
    cpiProgramId: string;
    borshSummary: string;
    timestamp: string;
  }> = [];

  async function executeAndRecord(params: {
    id: number;
    action: string;
    poolPair: string;
    lane: string;
    walletRole: string;
    account: PrivateKeyAccount;
    provider: ReturnType<typeof createEip1193Provider>;
    functionName: string;
    args: any[];
    value?: bigint;
    amountUsdc: string;
    cpiProgramId: string;
    borshSummary: string;
  }) {
    console.log(`\n⚡ [Tx #${params.id}] ${params.walletRole} (${params.account.address}) -> ${params.action}...`);
    const data = encodeFunctionData({
      abi: ammArtifact.abi,
      functionName: params.functionName,
      args: params.args,
    });

    const txHash = await submitRomeTx(params.provider, {
      from: params.account.address,
      to: contractAddress,
      data,
      value: params.value,
      minGas: 5_000_000n,
    });

    const rcpt = await pub.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
    if (rcpt.status !== "success") {
      throw new Error(`Tx #${params.id} (${params.action}) reverted: ${txHash}`);
    }
    const solSigs = await getSolanaSettlementSignatures(hadrian.rpcUrl, txHash);
    console.log(`   ✅ Confirmed! Hash: ${txHash}`);
    if (solSigs.length > 0) {
      console.log(`   🔗 Solana Settlement Sig: ${solSigs[0]}`);
    }

    transactions.push({
      id: params.id,
      action: params.action,
      poolPair: params.poolPair,
      lane: params.lane,
      walletRole: params.walletRole,
      sender: params.account.address,
      amountUsdc: params.amountUsdc,
      txHash,
      explorerUrl: `${hadrian.explorerUrl}tx/${txHash}`,
      solanaSignatures: solSigs,
      cpiProgramId: params.cpiProgramId,
      borshSummary: params.borshSummary,
      timestamp: new Date().toISOString(),
    });
  }

  // Tx 1: Deployer creates Unified Pool #3 (BPT2 / wUSDC) via createUnifiedPool
  await executeAndRecord({
    id: 1,
    action: "Create Shared-State Unified Pool (BPT2 / wUSDC)",
    poolPair: "BPT2 / wUSDC (0.15% Fee)",
    lane: "EVM Lane (submitRomeTx)",
    walletRole: "Deployer (#2)",
    account: deployer,
    provider: deployerProvider,
    functionName: "createUnifiedPool",
    args: [
      "BPT2 / wUSDC",
      "0x7d17492435a97762bf159cde400035246389139f",
      "0xbce339ba4c3a8de3bb8af1c5539e6ac11da3112d",
      "0x7d17492435a97762bf159cde400035246389139f000000000000000000000001",
      "0x3b86552f59e01c2a7536120263414186259a2d36b2c68f09c4412c09a82e0b44",
      "0x04bf8b5a044169c2556b461f29a8f15c0e92356a622a4e8f7b039d7b11234567",
      15,
      parseEther("65000"),
      parseEther("65000"),
    ],
    amountUsdc: "Pool Init",
    cpiProgramId: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    borshSummary: "JANUS_DEX_CPI:CREATE_UNIFIED_POOL + SPL Mint Binding",
  });

  // Tx 2: Trader 1 adds Dual-Lane Liquidity (0.30 USDC) to Pool 0 (wSOL / wUSDC) on EVM Lane
  await executeAndRecord({
    id: 2,
    action: "Add Unified Liquidity (EVM MetaMask Lane)",
    poolPair: "wSOL / wUSDC (0.25% Fee)",
    lane: "EVM Lane (submitRomeTx)",
    walletRole: "Trader 1 (#4)",
    account: trader1,
    provider: trader1Provider,
    functionName: "addLiquidityDualLane",
    args: [0, 0, "0x0000000000000000000000000000000000000000000000000000000000000000"],
    value: parseEther("0.30"),
    amountUsdc: "0.30 USDC",
    cpiProgramId: "CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW",
    borshSummary: "0xa9204f89a5634211 + u64LE(300000) + pool(0) + depth(1)",
  });

  // Tx 3: Trader 2 adds Dual-Lane Liquidity (0.25 USDC) to Pool 0 (wSOL / wUSDC) on Solana Synthetic Lane
  await executeAndRecord({
    id: 3,
    action: "Add Unified Liquidity (Solana Synthetic Lane)",
    poolPair: "wSOL / wUSDC (0.25% Fee)",
    lane: "Solana Dual-Lane (Synthetic Sender)",
    walletRole: "Trader 2 (#5)",
    account: trader2,
    provider: trader2Provider,
    functionName: "addLiquidityDualLane",
    args: [0, 1, "0x9a4b73e1549f1288c92045b18824e763421177a9e0411458c382972745682a45"],
    value: parseEther("0.25"),
    amountUsdc: "0.25 USDC",
    cpiProgramId: "CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW",
    borshSummary: "0xa9204f89a5634211 + u64LE(250000) + pool(0) + depth(1)",
  });

  // Tx 4: Trader 1 executes Atomic CPI Swap (wUSDC -> wSOL, 0.20 USDC) on Pool 0 (EVM Lane)
  await executeAndRecord({
    id: 4,
    action: "Atomic Constant-Product CPI Swap (wUSDC -> wSOL)",
    poolPair: "wSOL / wUSDC (0.25% Fee)",
    lane: "EVM Lane (submitRomeTx)",
    walletRole: "Trader 1 (#4)",
    account: trader1,
    provider: trader1Provider,
    functionName: "executeAtomicCpiSwap",
    args: [0, false, 1n, 0],
    value: parseEther("0.20"),
    amountUsdc: "0.20 USDC",
    cpiProgramId: "CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW",
    borshSummary: "0xf8c69e91e17587c8 + u64LE(200000) + pool(0) + depth(2)",
  });

  // Tx 5: Trader 2 executes Dual-Lane Solana Synthetic Swap (wUSDC -> wETH, 0.20 USDC) on Pool 1
  await executeAndRecord({
    id: 5,
    action: "Dual-Lane Solana Synthetic Swap (wUSDC -> wETH)",
    poolPair: "wETH / wUSDC (0.30% Fee)",
    lane: "Solana Dual-Lane (Synthetic Sender)",
    walletRole: "Trader 2 (#5)",
    account: trader2,
    provider: trader2Provider,
    functionName: "executeAtomicCpiSwap",
    args: [1, false, 1n, 1],
    value: parseEther("0.20"),
    amountUsdc: "0.20 USDC",
    cpiProgramId: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    borshSummary: "0xf8c69e91e17587c8 + u64LE(200000) + pool(1) + depth(2)",
  });

  // Tx 6: Trader 1 records CCTP Inbound Bridge Funding Route on-chain with RomeBridgeWithdraw
  await executeAndRecord({
    id: 6,
    action: "Sync CCTP Bridge Funding Route (RomeBridgeWithdraw)",
    poolPair: "CCTP v2 Sepolia -> Hadrian Gas",
    lane: "Bridge Funding Orchestrator",
    walletRole: "Trader 1 (#4)",
    account: trader1,
    provider: trader1Provider,
    functionName: "recordBridgeFundingRoute",
    args: [
      "CCTP_V2_USDC_GAS",
      "txf_e86c26b8d5f04815bf00c0a2fa1714c7",
      parseEther("10.0"),
    ],
    amountUsdc: "10.00 USDC",
    cpiProgramId: "CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd",
    borshSummary: "JANUS_DEX_CPI:BRIDGE_FUNDING_SETTLE_SYNC (txf_e86c26b8...)",
  });

  // Tx 7: Trader 2 executes Direct Custom Solana CPI via Precompile 0xFF...08 with explicit AccountMeta[]
  const memoProgramBytes32 =
    "0x054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d" as const;
  const customMemoHex = toHex("JANUS_DEX_DIRECT_CPI:DUAL_LANE_AMM_SETTLEMENT:DEPTH_1");
  await executeAndRecord({
    id: 7,
    action: "Direct Custom Solana Program CPI (0xFF..08)",
    poolPair: "Solana SPL Memo v2 / Audit Log",
    lane: "EVM / Solana Shared CPI",
    walletRole: "Trader 2 (#5)",
    account: trader2,
    provider: trader2Provider,
    functionName: "executeCustomSolanaCPI",
    args: [
      memoProgramBytes32,
      [{ pubkey: dexPda, is_signer: true, is_writable: false }],
      customMemoHex,
      [],
      1,
    ],
    amountUsdc: "Atomic CPI",
    cpiProgramId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    borshSummary: "Direct invoke(0xFF..08) with explicit AccountMeta[dexPda(signer)]",
  });

  // Read final on-chain metrics
  const [finalTvl, finalVolume, finalCpiSwaps, finalBridgeCount] = await Promise.all([
    pub.readContract({ address: contractAddress, abi: ammArtifact.abi, functionName: "totalDexTvlWei" }),
    pub.readContract({ address: contractAddress, abi: ammArtifact.abi, functionName: "totalSwapVolumeWei" }),
    pub.readContract({ address: contractAddress, abi: ammArtifact.abi, functionName: "totalCpiSwaps" }),
    pub.readContract({ address: contractAddress, abi: ammArtifact.abi, functionName: "totalBridgeFundingsLogged" }),
  ]);

  const deploymentData = {
    appName: "Janus DEX",
    deployedAt: new Date().toISOString(),
    hadrian: {
      chainId: HADRIAN_CHAIN_ID,
      name: hadrian.name,
      rpcUrl: hadrian.rpcUrl,
      explorerUrl: hadrian.explorerUrl,
      romeEvmProgramId: hadrian.romeEvmProgramId,
      contractAddress,
      deployTxHash,
      deployExplorerUrl: `${hadrian.explorerUrl}tx/${deployTxHash}`,
      contractExplorerUrl: `${hadrian.explorerUrl}address/${contractAddress}`,
      deploySolanaSignatures: deploySolanaSigs,
      activatePdaTxHash: activatePdaHash,
      dexAuthorityPda: dexPda,
      erc20SplFactory: erc20SplFactoryAddr,
      romeBridgeWithdraw: romeBridgeWithdrawAddr,
      metrics: {
        totalValueLockedWei: String(finalTvl),
        totalValueLockedUsdc: formatEther(finalTvl as bigint),
        totalSwapVolumeWei: String(finalVolume),
        totalSwapVolumeUsdc: formatEther(finalVolume as bigint),
        totalCpiSwaps: Number(finalCpiSwaps),
        totalBridgeFundingsLogged: Number(finalBridgeCount),
      },
      tokens: hadrianTokens,
    },
    rubicon: {
      chainId: RUBICON_CHAIN_ID,
      name: "Rome Rubicon Mainnet",
      rpcUrl: "https://rubicon.mainnet.romeprotocol.xyz/",
      explorerUrl: "https://via.mainnet.romeprotocol.xyz/",
      romeEvmProgramId: "RomePq9X3iAoTr813HR7uRarafFDUJty6GdiEceYpzX",
      gasToken: "ROME",
      erc20SplFactory: "0x4068aa74f93e70e8297b25f89695a2a31b00ae6e",
      romeBridgeWithdraw: "0xceea191753d161b6d1618082807a4959c0379c84",
      wUSDC: "0x0952d23364095c2d9f3a8e196a1c85a08088f9b3",
      wSOL: "0xc4e29e0f5b41522679786b9a59c419b4135ca113",
      wETH: "0x01e8b357b451232d21515518e67e616b80e892e9",
      solanaMainnetPrograms: {
        raydiumCpmm: mainnetPrograms.raydiumCpmm || "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
        orcaWhirlpool: mainnetPrograms.orcaWhirlpool || "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
        meteoraDammV1: mainnetPrograms.meteoraDammV1 || "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
        splToken: mainnetPrograms.splToken || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        splMemo: mainnetPrograms.memo || "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
      },
      status: "Ready & Configured for Mainnet Graduation (Calls Solana Mainnet Programs via Rome CPI 0xFF..08)",
    },
    wallets: {
      deployer: deployer.address,
      trader1: trader1.address,
      trader2: trader2.address,
    },
    precompiles: {
      system: "0xfF00000000000000000000000000000000000007",
      cpi: "0xFF00000000000000000000000000000000000008",
      helper: "0xff00000000000000000000000000000000000009",
    },
    devnetPrograms,
    transactions,
  };

  const outPath = path.join(process.cwd(), "src", "lib", "deployments.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(deploymentData, null, 2));
  console.log(`\n🎉 Saved full on-chain deployment & transaction history to ${outPath}`);
}

main().catch((err) => {
  console.error("❌ Deployment script error:", err);
  process.exit(1);
});
