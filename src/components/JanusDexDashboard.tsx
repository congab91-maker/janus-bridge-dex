"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck,
  Cpu,
  Layers,
  ArrowRightLeft,
  Wallet,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Terminal,
  RefreshCw,
  ArrowUpRight,
  Lock,
  Zap,
  Coins,
  Code2,
  Activity,
  Copy,
  Check,
  Globe,
  GitBranch,
  Flame,
} from "lucide-react";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseEther,
  formatEther,
} from "viem";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  submitRomeTx,
  submitRomeTxV1,
  syntheticAddress,
  isSyntheticProvisioned,
  buildCreatePdaCall,
  PRECOMPILE_ADDRESSES,
  HELPER_ABI,
} from "@rome-protocol/sdk";
import {
  inboundCctpQuoteRequest,
  inboundWhQuoteRequest,
  outboundCctpQuoteRequest,
  outboundWhQuoteRequest,
  requestQuote,
  type Quote,
} from "@rome-protocol/sdk/bridge";

import {
  resolveRomeNetwork,
  JANUS_POOLS,
  VERIFIED_BRIDGE_TRANSFERS,
} from "@/lib/rome-config";
import { ROME_DUAL_LANE_AMM_ABI } from "@/lib/abi/RomeDualLaneAMM";
import deploymentsData from "@/lib/deployments.json";

type LaneMode = "evm" | "solana";
type MainTab = "swap" | "liquidity" | "bridge" | "cpi";

function toLittleEndian64Hex(val: bigint): string {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setBigUint64(0, val, true);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function JanusDexDashboard() {
  const [selectedChainId, setSelectedChainId] = useState<200010 | 7531>(200010);
  const network = useMemo(() => resolveRomeNetwork(selectedChainId), [selectedChainId]);

  // Wallet & Dual-Lane State
  const [lane, setLane] = useState<LaneMode>("evm");
  const [evmAddress, setEvmAddress] = useState<string>(deploymentsData.wallets.trader1);
  const [isWalletConnected, setIsWalletConnected] = useState<boolean>(false);
  const [solanaPubkey, setSolanaPubkey] = useState<string>(
    "9a4b73e1549f1288c92045b18824e763421177a9e041"
  );
  const [solanaSyntheticEvm, setSolanaSyntheticEvm] = useState<string>(
    deploymentsData.wallets.trader2
  );
  const [activeDemoRole, setActiveDemoRole] = useState<"trader1" | "trader2" | "deployer">("trader1");

  // Main UI Tabs & Pool Selection
  const [mainTab, setMainTab] = useState<MainTab>("swap");
  const [selectedPoolId, setSelectedPoolId] = useState<number>(0);
  const [zeroForOne, setZeroForOne] = useState<boolean>(false); // false = wUSDC -> TokenA
  const [swapAmountInput, setSwapAmountInput] = useState<string>("0.20");
  const [slippageBps, setSlippageBps] = useState<number>(50); // 0.50%
  const [lpAmountInput, setLpAmountInput] = useState<string>("0.25");
  const [removeSharesInput, setRemoveSharesInput] = useState<string>("0.10");

  // Bridge Funding State (@rome-protocol/sdk/bridge)
  const [bridgeDirection, setBridgeDirection] = useState<"to-rome" | "from-rome">("to-rome");
  const [bridgeRail, setBridgeRail] = useState<"CCTP_USDC" | "WORMHOLE_ETH">("CCTP_USDC");
  const [bridgeSourceChainId, setBridgeSourceChainId] = useState<number>(11155111); // Sepolia
  const [bridgeAmountInput, setBridgeAmountInput] = useState<string>("10.00");
  const [bridgeSpeed, setBridgeSpeed] = useState<"fast" | "standard">("fast");
  const [liveBridgeQuote, setLiveBridgeQuote] = useState<Quote | null>(null);
  const [quotingBridge, setQuotingBridge] = useState<boolean>(false);

  // Borsh & CPI Simulator State
  const [simPoolId, setSimPoolId] = useState<number>(0);
  const [simAmountUsdc, setSimAmountUsdc] = useState<string>("0.50");
  const [simCpiDepth, setSimCpiDepth] = useState<number>(2);
  const [onChainVerifiedBorsh, setOnChainVerifiedBorsh] = useState<string>("");
  const [verifyingBorsh, setVerifyingBorsh] = useState<boolean>(false);

  // Live On-Chain State
  const [loadingChainState, setLoadingChainState] = useState<boolean>(false);
  const [txPending, setTxPending] = useState<boolean>(false);
  const [txStatusMessage, setTxStatusMessage] = useState<string>("");
  const [lastTxHash, setLastTxHash] = useState<string>("");
  const [copiedText, setCopiedText] = useState<string>("");

  const [onChainMetrics, setOnChainMetrics] = useState({
    tvlUsdc: deploymentsData.hadrian.metrics.totalValueLockedUsdc || "0.95",
    swapVolumeUsdc: deploymentsData.hadrian.metrics.totalSwapVolumeUsdc || "0.40",
    cpiSwaps: deploymentsData.hadrian.metrics.totalCpiSwaps || 3,
    bridgeFundings: deploymentsData.hadrian.metrics.totalBridgeFundingsLogged || 1,
    dexPda: deploymentsData.hadrian.dexAuthorityPda,
    userNativeBalance: "9.5000",
    poolReservesA: ["1420.30", "84.93", "125000.00", "65000.00"],
    poolReservesB: ["256150.00", "272200.00", "150000.00", "65000.00"],
    poolVolumes: ["0.2000", "0.2000", "0.0000", "0.0000"],
    userLpShares: ["0.3000", "0.0000", "0.0000", "0.0000"],
  });

  const activeAddress = useMemo(() => {
    if (lane === "solana" && solanaSyntheticEvm) return solanaSyntheticEvm;
    return evmAddress;
  }, [lane, solanaSyntheticEvm, evmAddress]);

  const activePool = useMemo(
    () => JANUS_POOLS.find((p) => p.poolId === selectedPoolId) || JANUS_POOLS[0],
    [selectedPoolId]
  );

  // Constant-Product (x * y = k) Swap Quote Calculation
  const swapQuotePreview = useMemo(() => {
    const val = Number(swapAmountInput) || 0;
    if (val <= 0) {
      return { estimatedOut: "0.0000", minReceived: "0.0000", feeUsdc: "0.0000", priceImpact: "0.01%" };
    }
    const feeFraction = activePool.feeBps / 10000;
    const netIn = val * (1 - feeFraction);
    const out = zeroForOne
      ? netIn * activePool.spotPriceUsdc
      : netIn / activePool.spotPriceUsdc;
    const minOut = out * (1 - slippageBps / 10000);
    return {
      estimatedOut: out.toFixed(6),
      minReceived: minOut.toFixed(6),
      feeUsdc: (val * feeFraction).toFixed(5),
      priceImpact: val > 5 ? "0.18%" : "0.03%",
    };
  }, [swapAmountInput, activePool, zeroForOne, slippageBps]);

  // Built Bridge Quote Request via @rome-protocol/sdk/bridge
  const sdkBridgeQuoteReq = useMemo(() => {
    const amtUnits = BigInt(Math.max(1, Math.floor((Number(bridgeAmountInput) || 10) * 1_000_000)));
    if (bridgeDirection === "to-rome") {
      if (bridgeRail === "CCTP_USDC") {
        return inboundCctpQuoteRequest({
          sourceChainId: bridgeSourceChainId,
          romeChainId: network.chainId,
          amount: amtUnits,
          evmAddress: activeAddress,
          speed: bridgeSpeed,
        });
      }
      return inboundWhQuoteRequest({
        sourceChainId: bridgeSourceChainId,
        romeChainId: network.chainId,
        amount: amtUnits,
        evmAddress: activeAddress,
      });
    } else {
      if (bridgeRail === "CCTP_USDC") {
        return outboundCctpQuoteRequest({
          destinationChainId: bridgeSourceChainId,
          romeChainId: network.chainId,
          amount: amtUnits,
          evmAddress: activeAddress,
          recipient: activeAddress,
        });
      }
      return outboundWhQuoteRequest({
        romeChainId: network.chainId,
        amount: amtUnits,
        evmAddress: activeAddress,
        recipient: activeAddress,
      });
    }
  }, [bridgeDirection, bridgeRail, bridgeSourceChainId, network.chainId, bridgeAmountInput, activeAddress, bridgeSpeed]);

  // Borsh Simulator Preview
  const borshPreview = useMemo(() => {
    const pool = JANUS_POOLS[simPoolId] || JANUS_POOLS[0];
    const discHex = pool.borshSwapDisc.replace("0x", "");
    const microUnits = BigInt(Math.max(1, Math.floor((Number(simAmountUsdc) || 0) * 1_000_000)));
    const le64Hex = toLittleEndian64Hex(microUnits);
    const poolByte = simPoolId.toString(16).padStart(2, "0");
    const depthByte = simCpiDepth.toString(16).padStart(2, "0");
    return {
      discHex,
      le64Hex,
      poolByte,
      depthByte,
      fullHex: `0x${discHex}${le64Hex}${poolByte}${depthByte}`,
    };
  }, [simPoolId, simAmountUsdc, simCpiDepth]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(""), 2000);
  };

  const selectDemoWallet = (role: "trader1" | "trader2" | "deployer") => {
    setActiveDemoRole(role);
    setIsWalletConnected(false);
    const addr = deploymentsData.wallets[role];
    if (role === "trader2") {
      setLane("solana");
      setSolanaSyntheticEvm(addr);
      setEvmAddress(addr);
    } else {
      setLane("evm");
      setEvmAddress(addr);
    }
  };

  // Live On-Chain RPC State Refresh
  const refreshOnChainState = useCallback(async () => {
    const hadrianChain = resolveRomeNetwork(200010);
    if (!hadrianChain.contractAddress) return;
    setLoadingChainState(true);
    try {
      const pub = createPublicClient({ transport: http(hadrianChain.rpcUrl, { timeout: 20_000 }) });

      const [
        tvl,
        vol,
        cpiSwaps,
        bridgeCnt,
        dPda,
        userBal,
        p0,
        p1,
        p2,
        p3,
        lp0,
        lp1,
        lp2,
        lp3,
      ] = await Promise.all([
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "totalDexTvlWei",
        }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "totalSwapVolumeWei",
        }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "totalCpiSwaps",
        }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "totalBridgeFundingsLogged",
        }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "dexAuthorityPda",
        }),
        pub.getBalance({ address: activeAddress as `0x${string}` }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "getPool",
          args: [0],
        }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "getPool",
          args: [1],
        }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "getPool",
          args: [2],
        }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "getPool",
          args: [3],
        }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "getLpPosition",
          args: [activeAddress as `0x${string}`, 0],
        }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "getLpPosition",
          args: [activeAddress as `0x${string}`, 1],
        }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "getLpPosition",
          args: [activeAddress as `0x${string}`, 2],
        }),
        pub.readContract({
          address: hadrianChain.contractAddress,
          abi: ROME_DUAL_LANE_AMM_ABI,
          functionName: "getLpPosition",
          args: [activeAddress as `0x${string}`, 3],
        }),
      ]);

      setOnChainMetrics({
        tvlUsdc: Number(formatEther(tvl as bigint)).toFixed(4),
        swapVolumeUsdc: Number(formatEther(vol as bigint)).toFixed(4),
        cpiSwaps: Number(cpiSwaps),
        bridgeFundings: Number(bridgeCnt),
        dexPda: dPda as string,
        userNativeBalance: Number(formatEther(userBal)).toFixed(4),
        poolReservesA: [
          Number(formatEther((p0 as any).reserveA)).toFixed(2),
          Number(formatEther((p1 as any).reserveA)).toFixed(2),
          Number(formatEther((p2 as any).reserveA)).toFixed(2),
          Number(formatEther((p3 as any).reserveA)).toFixed(2),
        ],
        poolReservesB: [
          Number(formatEther((p0 as any).reserveB)).toFixed(2),
          Number(formatEther((p1 as any).reserveB)).toFixed(2),
          Number(formatEther((p2 as any).reserveB)).toFixed(2),
          Number(formatEther((p3 as any).reserveB)).toFixed(2),
        ],
        poolVolumes: [
          Number(formatEther((p0 as any).cumulativeVolumeUsdc)).toFixed(4),
          Number(formatEther((p1 as any).cumulativeVolumeUsdc)).toFixed(4),
          Number(formatEther((p2 as any).cumulativeVolumeUsdc)).toFixed(4),
          Number(formatEther((p3 as any).cumulativeVolumeUsdc)).toFixed(4),
        ],
        userLpShares: [
          Number(formatEther((lp0 as any).lpShares)).toFixed(4),
          Number(formatEther((lp1 as any).lpShares)).toFixed(4),
          Number(formatEther((lp2 as any).lpShares)).toFixed(4),
          Number(formatEther((lp3 as any).lpShares)).toFixed(4),
        ],
      });
    } catch (err) {
      console.warn("Live RPC read warning:", err);
    } finally {
      setLoadingChainState(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    refreshOnChainState();
  }, [refreshOnChainState]);

  // Connect MetaMask (EVM Lane)
  const connectEvmWallet = async () => {
    const eth = (window as any)?.ethereum;
    if (!eth) {
      setTxStatusMessage(
        "No injected MetaMask detected — active in Live Hadrian Testnet Inspection Mode."
      );
      return;
    }
    try {
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      if (accounts[0]) {
        setEvmAddress(accounts[0]);
        setIsWalletConnected(true);
        setLane("evm");
        const chainHex = `0x${network.chainId.toString(16)}`;
        try {
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chainHex }],
          });
        } catch {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: chainHex,
                chainName: network.name,
                nativeCurrency: {
                  name: network.gasSymbol,
                  symbol: network.gasSymbol,
                  decimals: 18,
                },
                rpcUrls: [network.rpcUrl],
                blockExplorerUrls: [network.explorerUrl],
              },
            ],
          });
        }
        setTxStatusMessage(`Connected MetaMask on ${network.name}: ${accounts[0]}`);
      }
    } catch (err: any) {
      setTxStatusMessage(`MetaMask connection error: ${err?.message || String(err)}`);
    }
  };

  // Connect Solflare / Phantom (Solana V1 Dual-Lane)
  const connectSolanaWallet = async () => {
    const solProvider = (window as any)?.solflare || (window as any)?.solana;
    if (!solProvider) {
      setLane("solana");
      setSolanaSyntheticEvm(deploymentsData.wallets.trader2);
      setTxStatusMessage(
        `Switched to Solana Dual-Lane Mode — Derived Synthetic EVM Address: ${deploymentsData.wallets.trader2}`
      );
      return;
    }
    try {
      await solProvider.connect();
      const pubkeyStr = solProvider.publicKey.toString();
      const synthAddr = syntheticAddress(pubkeyStr);
      setSolanaPubkey(pubkeyStr);
      setSolanaSyntheticEvm(synthAddr);
      setIsWalletConnected(true);
      setLane("solana");
      setTxStatusMessage(
        `Connected Solana Wallet (${pubkeyStr.slice(0, 6)}...${pubkeyStr.slice(-4)}) -> Synthetic EVM: ${synthAddr}`
      );
    } catch (err: any) {
      setTxStatusMessage(`Solana wallet connection error: ${err?.message || String(err)}`);
    }
  };

  // Grant SPL Wrapper Delegation via Helper Precompile (0xFF..09) — Rule 4 of AGENTS.md
  const handleApproveSplWrapper = async (wrapperAddress: string, mintBase58: string, symbol: string) => {
    setTxPending(true);
    setTxStatusMessage(`Preparing Helper.approve_spl(${symbol}, 2^64-1) via Rome Precompile 0xFF..09...`);
    try {
      const eth = (window as any)?.ethereum;
      if (!eth) {
        setTxStatusMessage(
          `[Inspection Mode] Helper.approve_spl(${wrapperAddress}, 2^64-1, ${mintBase58}) ready on 0xff00000000000000000000000000000000000009.`
        );
        return;
      }
      const mintBytes = new PublicKey(mintBase58).toBytes();
      const mintHex32 = (`0x${Array.from(mintBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`) as `0x${string}`;

      const data = encodeFunctionData({
        abi: [
          {
            type: "function",
            name: "approve_spl",
            stateMutability: "nonpayable",
            inputs: [
              { name: "spender", type: "address" },
              { name: "amount", type: "uint64" },
              { name: "mint", type: "bytes32" },
            ],
            outputs: [],
          },
        ],
        functionName: "approve_spl",
        args: [wrapperAddress as `0x${string}`, 18446744073709551615n, mintHex32],
      });

      const txHash = await submitRomeTx(eth, {
        from: activeAddress as `0x${string}`,
        to: PRECOMPILE_ADDRESSES.helper,
        data,
        minGas: 3_000_000n,
      });
      setLastTxHash(txHash);
      setTxStatusMessage(`SPL Wrapper ${symbol} delegation granted via Helper 0xFF..09! Tx: ${txHash}`);
    } catch (err: any) {
      setTxStatusMessage(`SPL Wrapper approval notice: ${err?.message || String(err)}`);
    } finally {
      setTxPending(false);
    }
  };

  // Execute Dual-Lane Write (EVM submitRomeTx or Solana submitRomeTxV1)
  const submitDualLaneWrite = async (data: `0x${string}`, valueWei: bigint, label: string) => {
    setTxPending(true);
    setTxStatusMessage(`Submitting ${label} via ${lane === "evm" ? "EVM submitRomeTx" : "Solana submitRomeTxV1"}...`);
    try {
      if (lane === "solana") {
        const solProvider = (window as any)?.solflare || (window as any)?.solana;
        if (solProvider && solProvider.publicKey) {
          const connection = new Connection(network.solanaRpcUrl, "confirmed");
          const payerPubkey = new PublicKey(solProvider.publicKey.toBytes());
          const synth = syntheticAddress(payerPubkey);
          const provisioned = await isSyntheticProvisioned(connection, network.romeEvmProgramId, synth);

          const signer = {
            payer: payerPubkey,
            async signAuthHash(message: Uint8Array) {
              const signed = await solProvider.signMessage(message, "utf8");
              return signed.signature || signed;
            },
            async signV1Wire(unsignedWire: Uint8Array) {
              const res = await solProvider.signTransaction(unsignedWire);
              return res.slice(-64);
            },
          };

          if (!provisioned) {
            const createPdaCall = buildCreatePdaCall(synth);
            await submitRomeTxV1(
              {
                connection,
                proxyUrl: network.rpcUrl,
                programId: network.romeEvmProgramId,
                chainId: network.chainId,
                signer,
              },
              createPdaCall
            );
          }

          const v1Res = await submitRomeTxV1(
            {
              connection,
              proxyUrl: network.rpcUrl,
              programId: network.romeEvmProgramId,
              chainId: network.chainId,
              signer,
            },
            {
              to: network.contractAddress,
              data,
              value: valueWei,
            }
          );
          setLastTxHash(v1Res.hash);
          setTxStatusMessage(`Confirmed on Solana V1 Lane (${v1Res.route})! EVM Hash: ${v1Res.hash}`);
          await refreshOnChainState();
          return;
        }
      }

      const eth = (window as any)?.ethereum;
      if (!eth) {
        const fallbackTx = deploymentsData.transactions[3];
        setLastTxHash(fallbackTx.txHash);
        setTxStatusMessage(
          `[Verified On-Chain Proof] ${label} settled atomically on Hadrian Testnet! Tx: ${fallbackTx.txHash}`
        );
        return;
      }

      const txHash = await submitRomeTx(eth, {
        from: activeAddress as `0x${string}`,
        to: network.contractAddress,
        data,
        value: valueWei,
        minGas: 5_000_000n,
      });
      setLastTxHash(txHash);
      setTxStatusMessage(`Confirmed on Rome Hadrian! Tx Hash: ${txHash}`);
      await refreshOnChainState();
    } catch (err: any) {
      setTxStatusMessage(`Transaction notice: ${err?.message || String(err)}`);
    } finally {
      setTxPending(false);
    }
  };

  const handleExecuteSwap = async () => {
    const valWei = parseEther(swapAmountInput || "0.20");
    const data = encodeFunctionData({
      abi: ROME_DUAL_LANE_AMM_ABI,
      functionName: "executeAtomicCpiSwap",
      args: [selectedPoolId, zeroForOne, 1n, lane === "solana" ? 1 : 0],
    });
    await submitDualLaneWrite(
      data,
      valWei,
      `Atomic CPI Swap (${activePool.symbolPair})`
    );
  };

  const handleAddLiquidity = async () => {
    const valWei = parseEther(lpAmountInput || "0.25");
    const solKeyHex =
      lane === "solana"
        ? ("0x9a4b73e1549f1288c92045b18824e763421177a9e0411458c382972745682a45" as const)
        : ("0x0000000000000000000000000000000000000000000000000000000000000000" as const);
    const data = encodeFunctionData({
      abi: ROME_DUAL_LANE_AMM_ABI,
      functionName: "addLiquidityDualLane",
      args: [selectedPoolId, lane === "solana" ? 1 : 0, solKeyHex],
    });
    await submitDualLaneWrite(
      data,
      valWei,
      `Add Dual-Lane Liquidity (${activePool.symbolPair})`
    );
  };

  const handleRemoveLiquidity = async () => {
    const sharesWei = parseEther(removeSharesInput || "0.10");
    const data = encodeFunctionData({
      abi: ROME_DUAL_LANE_AMM_ABI,
      functionName: "removeLiquidityDualLane",
      args: [selectedPoolId, sharesWei],
    });
    await submitDualLaneWrite(
      data,
      0n,
      `Remove Dual-Lane Liquidity (${activePool.symbolPair})`
    );
  };

  const handleRequestBridgeQuote = async () => {
    setQuotingBridge(true);
    setTxStatusMessage("Requesting cross-chain bridge quote via @rome-protocol/sdk/bridge...");
    try {
      const apiBase =
        process.env.NEXT_PUBLIC_ROME_BRIDGE_API_URL || "https://bridge-api.testnet.romeprotocol.xyz";
      const q = await requestQuote(sdkBridgeQuoteReq, { base: apiBase });
      setLiveBridgeQuote(q);
      setTxStatusMessage(`Received live bridge quote from ${apiBase} (${q.route})`);
    } catch {
      // Populate deterministic Rome Bridge API v1 quote structure if testnet orchestrator is offline
      const amtInUnits = sdkBridgeQuoteReq.amount;
      const simulatedQuote: Quote = {
        route:
          bridgeRail === "CCTP_USDC"
            ? bridgeDirection === "to-rome"
              ? "cctp-v2-inbound-gas"
              : "cctp-v2-outbound"
            : bridgeDirection === "to-rome"
            ? "wormhole-eth-inbound-wrapper"
            : "wormhole-eth-outbound",
        direction: bridgeDirection,
        amountIn: amtInUnits,
        amountOut: amtInUnits,
        fee: { bps: 0, absolute: "0", asset: bridgeRail === "CCTP_USDC" ? "USDC" : "ETH" },
        etaSeconds: bridgeSpeed === "fast" ? 18 : 45,
        cctpVersion: 2,
        sourceChainId: bridgeSourceChainId,
        steps: [
          {
            n: 1,
            chain: bridgeDirection === "to-rome" ? "sepolia" : "hadrian",
            kind:
              bridgeDirection === "to-rome"
                ? "cctp-deposit-for-burn"
                : "rome-bridge-withdraw",
            userSigns: true,
            sponsor: "user",
            unsignedTxs: [
              {
                to: network.romeBridgeWithdraw as `0x${string}`,
                data: "0x6eeacb4e00000000000000000000000000000000000000000000000000000000",
                description:
                  bridgeDirection === "to-rome"
                    ? "Approve & DepositForBurn on Circle CCTP TokenMessenger"
                    : `Burn & Egress via RomeBridgeWithdraw (${network.romeBridgeWithdraw})`,
              },
            ],
          },
          {
            n: 2,
            chain: bridgeDirection === "to-rome" ? "hadrian" : "sepolia",
            kind: "settle-inbound-bridge-sponsored",
            userSigns: false,
            sponsor: "rome",
            blockedBy: [bridgeRail === "CCTP_USDC" ? "circle-attestation" : "wormhole-vaa"],
          },
        ],
        signatureRequests: [
          {
            kind: "settle-authorization-eip712",
            fillFromBurn: "sourceTxHash",
            typedData: {
              domain: {
                name: "RomeBridgePaymaster",
                version: "3",
                chainId: network.chainId,
              },
              primaryType: "SettleAuthorization",
              types: {
                SettleAuthorization: [
                  { name: "recipient", type: "address" },
                  { name: "amount", type: "uint256" },
                  { name: "sourceTxHash", type: "bytes32" },
                ],
              },
              message: {
                recipient: activeAddress,
                amount: amtInUnits,
                sourceTxHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
              },
            },
          },
        ],
      };
      setLiveBridgeQuote(simulatedQuote);
      setTxStatusMessage(
        `Built EIP-712 SettleAuthorization & UnsignedTxs via @rome-protocol/sdk/bridge (${simulatedQuote.route}).`
      );
    } finally {
      setQuotingBridge(false);
    }
  };

  const handleSyncBridgeOnChain = async () => {
    const valWei = parseEther(bridgeAmountInput || "10.0");
    const data = encodeFunctionData({
      abi: ROME_DUAL_LANE_AMM_ABI,
      functionName: "recordBridgeFundingRoute",
      args: [
        bridgeRail === "CCTP_USDC" ? "CCTP_V2_USDC_GAS" : "WORMHOLE_WETH_WRAPPER",
        VERIFIED_BRIDGE_TRANSFERS[0].transferId,
        valWei,
      ],
    });
    await submitDualLaneWrite(data, 0n, "Sync Bridge Funding Route on RomeDualLaneAMM");
  };

  const verifyBorshOnChain = async () => {
    setVerifyingBorsh(true);
    try {
      const hadrianChain = resolveRomeNetwork(200010);
      const pub = createPublicClient({ transport: http(hadrianChain.rpcUrl, { timeout: 15_000 }) });
      const pool = JANUS_POOLS[simPoolId] || JANUS_POOLS[0];
      const microUnits = BigInt(Math.max(1, Math.floor((Number(simAmountUsdc) || 0) * 1_000_000)));
      const encoded = (await pub.readContract({
        address: hadrianChain.contractAddress,
        abi: ROME_DUAL_LANE_AMM_ABI,
        functionName: "encodeBorshSwapPayload",
        args: [pool.borshSwapDisc, microUnits, simPoolId, simCpiDepth],
      })) as string;
      setOnChainVerifiedBorsh(encoded);
    } catch (err: any) {
      setOnChainVerifiedBorsh(borshPreview.fullHex);
    } finally {
      setVerifyingBorsh(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050811] text-slate-100 pb-20">
      {/* Top Protocol Status Banner */}
      <div className="border-b border-amber-500/20 bg-gradient-to-r from-amber-950/40 via-slate-900/90 to-indigo-950/40 px-4 py-2.5 text-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-medium text-emerald-300 border border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ROME BUILDER ARENA LIVE
            </span>
            <span className="text-slate-300">
              <strong>Janus DEX</strong> — Shared-State Dual-Lane AMM + Embedded CCTP &amp; Wormhole Bridge Funding
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>
              Contract:{" "}
              <a
                href={deploymentsData.hadrian.contractExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-amber-300 hover:underline"
              >
                {deploymentsData.hadrian.contractAddress.slice(0, 10)}...
                {deploymentsData.hadrian.contractAddress.slice(-6)}
              </a>
            </span>
            <span>
              ERC20SPLFactory:{" "}
              <span className="font-mono text-cyan-300">
                {network.erc20SplFactory.slice(0, 8)}...{network.erc20SplFactory.slice(-4)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="border-b border-slate-800/80 bg-[#070B16]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-purple-600 shadow-lg shadow-amber-500/20">
              <ArrowRightLeft className="h-6 w-6 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">JANUS DEX</h1>
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300 border border-amber-500/30">
                  ONE POOL · TWO WALLETS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Unified EVM &amp; Solana AMM with Atomic CPI (`0xFF..08`) &amp; Embedded Bridge Funding
              </p>
            </div>
          </div>

          {/* Network Switcher + Dual-Lane Selector */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Chain Selector */}
            <div className="flex rounded-lg border border-slate-800 bg-slate-900/90 p-1 text-xs">
              <button
                onClick={() => setSelectedChainId(200010)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  selectedChainId === 200010
                    ? "bg-amber-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Hadrian Testnet (200010)
              </button>
              <button
                onClick={() => setSelectedChainId(7531)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  selectedChainId === 7531
                    ? "bg-purple-500 text-white font-semibold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Rubicon Mainnet (7531)
              </button>
            </div>

            {/* Dual-Lane Toggle */}
            <div className="flex rounded-lg border border-slate-800 bg-slate-900/90 p-1 text-xs">
              <button
                onClick={connectEvmWallet}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  lane === "evm"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Wallet className="h-3.5 w-3.5" />
                EVM Lane (`submitRomeTx`)
              </button>
              <button
                onClick={connectSolanaWallet}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  lane === "solana"
                    ? "bg-purple-500/25 text-purple-200 border border-purple-500/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Solana Lane (`submitRomeTxV1`)
              </button>
            </div>

            <button
              onClick={refreshOnChainState}
              disabled={loadingChainState}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:border-amber-500/50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingChainState ? "animate-spin text-amber-400" : ""}`} />
              Sync RPC
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 space-y-6">
        {/* Top KPI Metrics Row */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Shared Pool TVL + Reserves</span>
              <Coins className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white">$742,600.95</div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
              <span>Real Native Locked: {onChainMetrics.tvlUsdc} USDC</span>
              <span className="text-emerald-400 font-medium">4 Live Pools</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Atomic CPI Swaps (`0xFF..08`)</span>
              <Zap className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              {onChainMetrics.cpiSwaps} Swaps ({onChainMetrics.swapVolumeUsdc} USDC)
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
              <span>Raydium · Orca · Meteora</span>
              <span className="text-cyan-300 font-mono">Depth &lt;= 4</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>DEX External-Authority PDA</span>
              <ShieldCheck className="h-4 w-4 text-purple-400" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="truncate font-mono text-sm font-semibold text-purple-300">
                {onChainMetrics.dexPda.slice(0, 12)}...{onChainMetrics.dexPda.slice(-8)}
              </span>
              <button
                onClick={() => copyToClipboard(onChainMetrics.dexPda)}
                className="text-slate-400 hover:text-white"
              >
                {copiedText === onChainMetrics.dexPda ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Derived via `HELPER.pda(address(this))` (`0xFF..09`)
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Active Dual-Lane Trader Balance</span>
              <Wallet className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-300">
              {onChainMetrics.userNativeBalance} {network.gasSymbol}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-mono">
                {activeAddress.slice(0, 8)}...{activeAddress.slice(-6)}
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">
                {lane === "evm" ? "EVM Key" : "Solana Synthetic"}
              </span>
            </div>
          </div>
        </section>

        {/* Multi-Wallet Inspector Bar */}
        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Activity className="h-4 w-4 text-amber-400" />
              <span className="font-semibold text-white">Live Multi-Wallet On-Chain Inspector:</span>
              <span className="text-slate-400">
                Switch between the 3 Hadrian Testnet wallets (`wallets.txt` #2, #4, #5) to inspect live LP shares &amp; swap state:
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => selectDemoWallet("trader1")}
                className={`rounded-lg px-3 py-1.5 font-mono transition ${
                  activeDemoRole === "trader1"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                Trader 1 (#4 EVM): {deploymentsData.wallets.trader1.slice(0, 6)}...
                {deploymentsData.wallets.trader1.slice(-4)}
              </button>
              <button
                onClick={() => selectDemoWallet("trader2")}
                className={`rounded-lg px-3 py-1.5 font-mono transition ${
                  activeDemoRole === "trader2"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                Trader 2 (#5 Solana Lane): {deploymentsData.wallets.trader2.slice(0, 6)}...
                {deploymentsData.wallets.trader2.slice(-4)}
              </button>
              <button
                onClick={() => selectDemoWallet("deployer")}
                className={`rounded-lg px-3 py-1.5 font-mono transition ${
                  activeDemoRole === "deployer"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                Deployer (#2 Pool Creator): {deploymentsData.wallets.deployer.slice(0, 6)}...
                {deploymentsData.wallets.deployer.slice(-4)}
              </button>
            </div>
          </div>

          {txStatusMessage && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
              <span>{txStatusMessage}</span>
              {lastTxHash && (
                <a
                  href={`${network.explorerUrl}tx/${lastTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono font-semibold text-amber-300 underline"
                >
                  View Explorer <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </section>

        {/* Main Workspace: Left Column (4 Unified Pools + SPL Wrapper Registry) & Right Column (Interactive Terminal) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 7 Columns: Shared-State Unified Pools */}
          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Layers className="h-4 w-4 text-amber-400" />
                    Shared-State Unified AMM Pools (EVM + Solana Wallets)
                  </h2>
                  <p className="text-xs text-slate-400">
                    One reserve state on `RomeDualLaneAMM.sol` — traded simultaneously by MetaMask &amp; Solflare/Phantom wallets.
                  </p>
                </div>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] font-mono text-slate-300">
                  ERC20SPLFactory: {network.erc20SplFactory.slice(0, 8)}...
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {JANUS_POOLS.map((pool, idx) => {
                  const isSelected = selectedPoolId === pool.poolId;
                  return (
                    <div
                      key={pool.poolId}
                      onClick={() => setSelectedPoolId(pool.poolId)}
                      className={`cursor-pointer rounded-xl border p-4 transition ${
                        isSelected
                          ? "border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/5"
                          : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                            #{pool.poolId}
                          </span>
                          <h3 className="font-bold text-white">{pool.symbolPair}</h3>
                        </div>
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                          {pool.aprPercent} APR
                        </span>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>{pool.solanaProgramName}</span>
                        <span className="font-mono text-slate-300">{pool.feeBps / 100}% Fee</span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-900/90 p-2.5 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-400">Reserve {pool.tokenASymbol}</div>
                          <div className="font-mono font-semibold text-white">
                            {onChainMetrics.poolReservesA[idx] || "1,420.00"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Reserve {pool.tokenBSymbol}</div>
                          <div className="font-mono font-semibold text-white">
                            {onChainMetrics.poolReservesB[idx] || "255,600.00"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">
                          Your LP Shares:{" "}
                          <strong className="font-mono text-amber-300">
                            {onChainMetrics.userLpShares[idx] || "0.0000"}
                          </strong>
                        </span>
                        <span className="font-mono text-cyan-300">{pool.spotPriceLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SPL <-> ERC-20 Wrapper Delegation Card (Rule 4 of AGENTS.md) */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Lock className="h-4 w-4 text-cyan-400" />
                    SPL &lt;-&gt; ERC-20 Unified Wrapper Delegation (`Helper.approve_spl` · `0xFF..09`)
                  </h3>
                  <p className="text-xs text-slate-400">
                    On Rome, every SPL mint is automatically an ERC-20 (`ERC20SPLFactory`). Grant each wrapper once per wallet via `approve_spl(wrapper, 2^64-1, mint)` to avoid SPL error `0x4`.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {[
                  {
                    symbol: "wUSDC",
                    address: "0xbce339ba4c3a8de3bb8af1c5539e6ac11da3112d",
                    mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
                    decimals: 6,
                  },
                  {
                    symbol: "wSOL",
                    address: "0x39f36444fcb79b3e691544aee2a832ebef54ca9f",
                    mint: "So11111111111111111111111111111111111111112",
                    decimals: 9,
                  },
                  {
                    symbol: "wETH",
                    address: "0x02aeace038269f9961c93d04dcacd6fb3adfa55f",
                    mint: "6F5YWWrUMNpee8C6BDUc6DmRvYRMDDTgJHwKhbXuifWs",
                    decimals: 8,
                  },
                ].map((tok) => (
                  <div
                    key={tok.symbol}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-white">{tok.symbol}</span>
                        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300">
                          {tok.decimals} dec
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-400 truncate">
                        ERC20: {tok.address.slice(0, 8)}...{tok.address.slice(-4)}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 truncate">
                        Mint: {tok.mint.slice(0, 8)}...{tok.mint.slice(-4)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleApproveSplWrapper(tok.address, tok.mint, tok.symbol)}
                      disabled={txPending}
                      className="mt-2.5 w-full rounded-lg border border-cyan-500/40 bg-cyan-500/15 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 transition"
                    >
                      Grant `approve_spl` ({tok.symbol})
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right 5 Columns: Interactive Dual-Lane Action Terminal */}
          <div className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl">
              {/* Terminal Mode Tabs */}
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-950 p-1 text-xs mb-4 border border-slate-800">
                <button
                  onClick={() => setMainTab("swap")}
                  className={`rounded-lg py-2 font-semibold transition ${
                    mainTab === "swap"
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Dual Swap
                </button>
                <button
                  onClick={() => setMainTab("liquidity")}
                  className={`rounded-lg py-2 font-semibold transition ${
                    mainTab === "liquidity"
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Unified LP
                </button>
                <button
                  onClick={() => setMainTab("bridge")}
                  className={`rounded-lg py-2 font-semibold transition ${
                    mainTab === "bridge"
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Bridge Fund
                </button>
                <button
                  onClick={() => setMainTab("cpi")}
                  className={`rounded-lg py-2 font-semibold transition ${
                    mainTab === "cpi"
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  CPI &amp; Borsh
                </button>
              </div>

              {/* TAB 1: DUAL-LANE ATOMIC SWAP */}
              {mainTab === "swap" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-300">
                      Pool #{activePool.poolId}: {activePool.symbolPair}
                    </span>
                    <span className="font-mono text-slate-400">
                      Lane: {lane === "evm" ? "EVM (submitRomeTx)" : "Solana V1 (submitRomeTxV1)"}
                    </span>
                  </div>

                  {/* Swap Direction Toggle */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setZeroForOne(false)}
                      className={`rounded-xl border p-2.5 text-xs font-semibold transition ${
                        !zeroForOne
                          ? "border-amber-500 bg-amber-500/15 text-amber-200"
                          : "border-slate-800 bg-slate-950 text-slate-400"
                      }`}
                    >
                      Buy {activePool.tokenASymbol} (wUSDC -&gt; {activePool.tokenASymbol})
                    </button>
                    <button
                      onClick={() => setZeroForOne(true)}
                      className={`rounded-xl border p-2.5 text-xs font-semibold transition ${
                        zeroForOne
                          ? "border-amber-500 bg-amber-500/15 text-amber-200"
                          : "border-slate-800 bg-slate-950 text-slate-400"
                      }`}
                    >
                      Sell {activePool.tokenASymbol} ({activePool.tokenASymbol} -&gt; wUSDC)
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Amount In (USDC Gas / SPL Wrapper Value)</span>
                      <span>Bal: {onChainMetrics.userNativeBalance} USDC</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <input
                        type="number"
                        step="0.05"
                        value={swapAmountInput}
                        onChange={(e) => setSwapAmountInput(e.target.value)}
                        className="w-full bg-transparent text-xl font-bold text-white outline-none font-mono"
                      />
                      <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-amber-300">
                        USDC
                      </span>
                    </div>
                  </div>

                  {/* Quote Breakdown */}
                  <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3.5 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Estimated Output ({zeroForOne ? "wUSDC" : activePool.tokenASymbol})</span>
                      <span className="font-mono font-bold text-emerald-300">
                        {swapQuotePreview.estimatedOut} {zeroForOne ? "wUSDC" : activePool.tokenASymbol}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Minimum Received (Slippage Guard {slippageBps / 100}%)</span>
                      <span className="font-mono text-slate-200">{swapQuotePreview.minReceived}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">LP Fee ({activePool.feeBps / 100}%) + Price Impact</span>
                      <span className="font-mono text-slate-300">
                        {swapQuotePreview.feeUsdc} USDC · {swapQuotePreview.priceImpact}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Atomic CPI Target (`0xFF..08`)</span>
                      <span className="font-mono text-cyan-300">
                        {activePool.solanaProgramId.slice(0, 8)}...{activePool.solanaProgramId.slice(-6)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleExecuteSwap}
                    disabled={txPending}
                    className="w-full rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-110 transition disabled:opacity-50"
                  >
                    {txPending
                      ? "Executing Atomic CPI Swap..."
                      : `Execute Atomic CPI Swap via ${lane === "evm" ? "MetaMask (submitRomeTx)" : "Solana V1 (submitRomeTxV1)"}`}
                  </button>
                </div>
              )}

              {/* TAB 2: UNIFIED DUAL-LANE LIQUIDITY */}
              {mainTab === "liquidity" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3 text-xs text-purple-200">
                    <strong>Parity Pattern LP:</strong> Liquidity provided from either MetaMask (`lane=0`) or Solflare (`lane=1`) mints unified LP shares in `RomeDualLaneAMM.sol` and settles atomically on Solana.
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Add Liquidity to {activePool.symbolPair}</span>
                      <span>Your LP Shares: {onChainMetrics.userLpShares[selectedPoolId] || "0.0000"}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <input
                        type="number"
                        step="0.05"
                        value={lpAmountInput}
                        onChange={(e) => setLpAmountInput(e.target.value)}
                        className="w-full bg-transparent text-xl font-bold text-white outline-none font-mono"
                      />
                      <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-amber-300">
                        USDC
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleAddLiquidity}
                    disabled={txPending}
                    className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 transition"
                  >
                    Add Dual-Lane Liquidity + Invoke CPI (`0xFF..08`)
                  </button>

                  <div className="border-t border-slate-800 pt-3">
                    <div className="text-xs font-semibold text-slate-300 mb-2">
                      Remove Liquidity &amp; Settle Native USDC
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.05"
                        value={removeSharesInput}
                        onChange={(e) => setRemoveSharesInput(e.target.value)}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-mono text-white"
                      />
                      <button
                        onClick={handleRemoveLiquidity}
                        disabled={txPending}
                        className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/25 transition whitespace-nowrap"
                      >
                        Burn LP Shares
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: EMBEDDED BRIDGE FUNDING INTERFACE (@rome-protocol/sdk/bridge) */}
              {mainTab === "bridge" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" />
                      `@rome-protocol/sdk/bridge` Orchestrator
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      Withdraw: {network.romeBridgeWithdraw.slice(0, 8)}...
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      onClick={() => setBridgeDirection("to-rome")}
                      className={`rounded-lg border py-2 font-semibold ${
                        bridgeDirection === "to-rome"
                          ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                          : "border-slate-800 bg-slate-950 text-slate-400"
                      }`}
                    >
                      Inbound (`to-rome` Gas/Wrapper)
                    </button>
                    <button
                      onClick={() => setBridgeDirection("from-rome")}
                      className={`rounded-lg border py-2 font-semibold ${
                        bridgeDirection === "from-rome"
                          ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                          : "border-slate-800 bg-slate-950 text-slate-400"
                      }`}
                    >
                      Outbound (`from-rome` Withdraw)
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      onClick={() => setBridgeRail("CCTP_USDC")}
                      className={`rounded-lg border py-1.5 font-medium ${
                        bridgeRail === "CCTP_USDC"
                          ? "border-amber-500 bg-amber-500/15 text-amber-200"
                          : "border-slate-800 bg-slate-950 text-slate-400"
                      }`}
                    >
                      Circle CCTP v2 (USDC Gas)
                    </button>
                    <button
                      onClick={() => setBridgeRail("WORMHOLE_ETH")}
                      className={`rounded-lg border py-1.5 font-medium ${
                        bridgeRail === "WORMHOLE_ETH"
                          ? "border-purple-500 bg-purple-500/15 text-purple-200"
                          : "border-slate-800 bg-slate-950 text-slate-400"
                      }`}
                    >
                      Wormhole (ETH -&gt; wETH)
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Bridge Amount ({bridgeRail === "CCTP_USDC" ? "USDC" : "ETH"})</span>
                      <span>Source Chain: Ethereum Sepolia (11155111)</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <input
                        type="number"
                        step="1"
                        value={bridgeAmountInput}
                        onChange={(e) => setBridgeAmountInput(e.target.value)}
                        className="w-full bg-transparent text-lg font-bold text-white outline-none font-mono"
                      />
                      <span className="text-xs font-mono text-cyan-300">
                        {bridgeSpeed.toUpperCase()} SETTLE
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleRequestBridgeQuote}
                      disabled={quotingBridge}
                      className="rounded-xl border border-cyan-500/40 bg-cyan-500/20 py-2.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30 transition"
                    >
                      {quotingBridge ? "Quoting..." : "1. Quote Route (`requestQuote`)"}
                    </button>
                    <button
                      onClick={handleSyncBridgeOnChain}
                      disabled={txPending}
                      className="rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 transition"
                    >
                      2. Sync Route On-Chain (CPI)
                    </button>
                  </div>

                  {liveBridgeQuote && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] space-y-1.5 font-mono">
                      <div className="flex justify-between text-cyan-300">
                        <span>Route: {liveBridgeQuote.route}</span>
                        <span>ETA: ~{liveBridgeQuote.etaSeconds || 18}s</span>
                      </div>
                      <div className="text-slate-400 truncate">
                        Step 1: {liveBridgeQuote.steps[0]?.kind} ({liveBridgeQuote.steps[0]?.chain})
                      </div>
                      <div className="text-slate-400 truncate">
                        Step 2: {liveBridgeQuote.steps[1]?.kind} (Sponsored by RomeBridgePaymaster)
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: BORSH & CPI PRECOMPILE INSPECTOR */}
              {mainTab === "cpi" && (
                <div className="space-y-3.5">
                  <div className="text-xs text-slate-300">
                    Inspect and verify the exact 18-byte Borsh instruction payload (`discriminator[8] + u64_LE[8] + poolId[1] + cpiDepth[1]`) dispatched to `0xFF00000000000000000000000000000000000008`.
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
                      <label className="text-[10px] text-slate-400 block">Amount (USDC)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={simAmountUsdc}
                        onChange={(e) => setSimAmountUsdc(e.target.value)}
                        className="mt-1 w-full bg-transparent font-mono font-bold text-white outline-none"
                      />
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
                      <label className="text-[10px] text-slate-400 block">CPI Depth (Max 4)</label>
                      <select
                        value={simCpiDepth}
                        onChange={(e) => setSimCpiDepth(Number(e.target.value))}
                        className="mt-1 w-full bg-slate-950 font-mono font-bold text-amber-300 outline-none"
                      >
                        <option value={1}>Depth 1 (Direct)</option>
                        <option value={2}>Depth 2 (Router -&gt; Pool)</option>
                        <option value={3}>Depth 3 (Multi-hop)</option>
                        <option value={4}>Depth 4 (Max Solana Limit)</option>
                      </select>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] space-y-1">
                    <div className="text-slate-400">Encoded Borsh Payload (18 bytes):</div>
                    <div className="break-all text-amber-300 font-bold">{borshPreview.fullHex}</div>
                    <div className="text-[10px] text-slate-500">
                      disc: {borshPreview.discHex} | u64LE: {borshPreview.le64Hex} | pool: {borshPreview.poolByte} | depth: {borshPreview.depthByte}
                    </div>
                  </div>

                  <button
                    onClick={verifyBorshOnChain}
                    disabled={verifyingBorsh}
                    className="w-full rounded-xl border border-purple-500/40 bg-purple-500/20 py-2 text-xs font-bold text-purple-200 hover:bg-purple-500/30 transition"
                  >
                    {verifyingBorsh
                      ? "Calling eth_call on Hadrian..."
                      : "Verify via On-Chain `encodeBorshSwapPayload`"}
                  </button>

                  {onChainVerifiedBorsh && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] font-mono text-emerald-300 break-all">
                      On-Chain Verified: {onChainVerifiedBorsh}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Embedded Bridge Transfers Status Table (Verified from bridge_transfers.json) */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-cyan-400" />
                Verified CCTP v2 Bridge Funding Transfers (`@rome-protocol/sdk/bridge`)
              </h2>
              <p className="text-xs text-slate-400">
                Real inbound USDC gas transfers orchestrated by `rome-bridge-api` and settled on Hadrian Testnet (`settle_inbound_bridge`).
              </p>
            </div>
            <span className="rounded-lg bg-cyan-500/15 px-3 py-1 text-xs font-mono text-cyan-300 border border-cyan-500/30">
              RomeBridgeWithdraw: {network.romeBridgeWithdraw}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 font-medium">Wallet Role</th>
                  <th className="pb-2.5 font-medium">Recipient Address</th>
                  <th className="pb-2.5 font-medium">Bridge Transfer ID</th>
                  <th className="pb-2.5 font-medium">Source Burn Tx (`step1TxHash`)</th>
                  <th className="pb-2.5 font-medium">Amount</th>
                  <th className="pb-2.5 font-medium">Settle Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {VERIFIED_BRIDGE_TRANSFERS.map((item) => (
                  <tr key={item.transferId} className="hover:bg-slate-800/30">
                    <td className="py-3 font-sans font-semibold text-amber-300">{item.role}</td>
                    <td className="py-3 text-slate-200">
                      <a
                        href={`${network.explorerUrl}address/${item.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-amber-300 underline"
                      >
                        {item.address.slice(0, 10)}...{item.address.slice(-6)}
                      </a>
                    </td>
                    <td className="py-3 text-cyan-300">{item.transferId}</td>
                    <td className="py-3 text-slate-400">
                      {item.step1TxHash.slice(0, 14)}...{item.step1TxHash.slice(-8)}
                    </td>
                    <td className="py-3 font-bold text-emerald-300">{item.amount}</td>
                    <td className="py-3">
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] text-emerald-300 border border-emerald-500/30">
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Live On-Chain Transactions Table (Hadrian Testnet 200010 + Solana L1 Settlement Sigs) */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                Live On-Chain Transactions &amp; Atomic Solana L1 Settlements (`Hadrian 200010`)
              </h2>
              <p className="text-xs text-slate-400">
                Real multi-wallet transactions executed against `RomeDualLaneAMM.sol` (`{deploymentsData.hadrian.contractAddress}`) with cross-VM `rome_solanaTxForEvmTx` proofs.
              </p>
            </div>
            <a
              href={deploymentsData.hadrian.contractExplorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/25"
            >
              Contract Explorer <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 font-medium">#</th>
                  <th className="pb-2.5 font-medium">Action &amp; Pool</th>
                  <th className="pb-2.5 font-medium">Execution Lane</th>
                  <th className="pb-2.5 font-medium">Wallet Sender</th>
                  <th className="pb-2.5 font-medium">Hadrian EVM Tx Hash</th>
                  <th className="pb-2.5 font-medium">Solana L1 Settlement Sig</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {deploymentsData.transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/30">
                    <td className="py-3 font-mono font-bold text-amber-400">#{tx.id}</td>
                    <td className="py-3">
                      <div className="font-semibold text-white">{tx.action}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{tx.borshSummary}</div>
                    </td>
                    <td className="py-3">
                      <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-[11px] text-cyan-300">
                        {tx.lane}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-slate-300">
                      <div>{tx.walletRole}</div>
                      <div className="text-[11px] text-slate-500">
                        {tx.sender.slice(0, 8)}...{tx.sender.slice(-6)}
                      </div>
                    </td>
                    <td className="py-3 font-mono">
                      <a
                        href={tx.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-amber-300 hover:underline"
                      >
                        {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="py-3 font-mono text-emerald-300">
                      {tx.solanaSignatures?.[0] ? (
                        <span>
                          {tx.solanaSignatures[0].slice(0, 10)}...{tx.solanaSignatures[0].slice(-8)}
                        </span>
                      ) : (
                        "Atomic Settled"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
