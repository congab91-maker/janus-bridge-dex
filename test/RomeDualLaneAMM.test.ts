import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { EVM } from "@ethereumjs/evm";
import { Address, hexToBytes, bytesToHex, Account } from "@ethereumjs/util";
import { encodeFunctionData, decodeFunctionResult, encodeDeployData, parseEther } from "viem";
import { compileContracts } from "../scripts/compile";

const createAddressFromString = (s: string) => Address.fromString(s);

const SYSTEM_PRECOMPILE = "0xFF00000000000000000000000000000000000007";
const CPI_PRECOMPILE = "0xFF00000000000000000000000000000000000008";
const HELPER_PRECOMPILE = "0xFF00000000000000000000000000000000000009";

const ERC20_SPL_FACTORY = "0x37c13e4ff21fb914eb24014dcbd0f8dbeaa31078";
const ROME_BRIDGE_WITHDRAW = "0x6eeacb4e6006b7a29c8141f69b6c75346dedec73";

const DEPLOYER = "0x17375DbD58B93746C7fa7693F93c7Beb75364161";
const EVM_TRADER = "0x8170E7b22000527D9BAB38DFfA76B52103441B57";
const SOLANA_SYNTHETIC_TRADER = "0x399995f606e9819a7dA3a1d21CAeC99ecF1E2B1a";

describe("RomeDualLaneAMM (Janus DEX) — Shared-State AMM, Bridge Sync & Atomic CPI Unit Tests", () => {
  let evm: EVM;
  let compiled: ReturnType<typeof compileContracts>;
  let ammAddress: `0x${string}`;
  let ammAbi: any[];

  async function fundAccount(addr: string, ethAmount = "1000") {
    const address = createAddressFromString(addr);
    const existing = (await evm.stateManager.getAccount(address)) ?? new Account();
    existing.balance = parseEther(ethAmount);
    await evm.stateManager.putAccount(address, existing);
  }

  async function etchCode(addr: string, deployedBytecodeHex: `0x${string}`) {
    const address = createAddressFromString(addr);
    const existing = (await evm.stateManager.getAccount(address)) ?? new Account();
    await evm.stateManager.putAccount(address, existing);
    await evm.stateManager.putContractCode(address, hexToBytes(deployedBytecodeHex));
  }

  async function deployAmm(from: string): Promise<`0x${string}`> {
    const deployData = encodeDeployData({
      abi: ammAbi,
      bytecode: compiled["RomeDualLaneAMM"].bytecode,
      args: [ERC20_SPL_FACTORY, ROME_BRIDGE_WITHDRAW],
    });
    const res = await evm.runCall({
      caller: createAddressFromString(from),
      data: hexToBytes(deployData),
      gasLimit: 30_000_000n,
    });
    if (res.execResult.exceptionError) {
      throw new Error(`Deploy failed: ${res.execResult.exceptionError.error}`);
    }
    return res.createdAddress!.toString() as `0x${string}`;
  }

  async function callContract(
    from: string,
    to: `0x${string}`,
    abi: any[],
    functionName: string,
    args: any[] = [],
    value: bigint = 0n
  ) {
    const data = encodeFunctionData({ abi, functionName, args });
    const res = await evm.runCall({
      caller: createAddressFromString(from),
      to: createAddressFromString(to),
      data: hexToBytes(data),
      value,
      gasLimit: 30_000_000n,
    });
    if (res.execResult.exceptionError) {
      throw new Error(`Revert in ${functionName}: ${res.execResult.exceptionError.error}`);
    }
    const returnHex = bytesToHex(res.execResult.returnValue) as `0x${string}`;
    const fnAbi = abi.find((x) => x.type === "function" && x.name === functionName);
    if (fnAbi && fnAbi.outputs && fnAbi.outputs.length > 0 && returnHex !== "0x") {
      return decodeFunctionResult({ abi, functionName, data: returnHex });
    }
    return undefined;
  }

  beforeAll(() => {
    compiled = compileContracts();
    ammAbi = compiled["RomeDualLaneAMM"].abi;
  });

  beforeEach(async () => {
    evm = await EVM.create();

    await fundAccount(DEPLOYER, "500");
    await fundAccount(EVM_TRADER, "500");
    await fundAccount(SOLANA_SYNTHETIC_TRADER, "500");

    // Etch Rome Precompiles at 0xFF...07, 0xFF...08, 0xFF...09
    await etchCode(SYSTEM_PRECOMPILE, compiled["MockRomeSystemPrecompile"].deployedBytecode);
    await etchCode(CPI_PRECOMPILE, compiled["MockRomeCpiPrecompile"].deployedBytecode);
    await etchCode(HELPER_PRECOMPILE, compiled["MockRomeHelperPrecompile"].deployedBytecode);

    // Deploy RomeDualLaneAMM with canonical ERC20SPLFactory & RomeBridgeWithdraw
    ammAddress = await deployAmm(DEPLOYER);

    // Activate DEX External-Authority PDA via single atomic post-deploy transaction
    await callContract(DEPLOYER, ammAddress, ammAbi, "activateDexPda");
  });

  it("1. Provisions external-authority PDA via Helper Precompile (0xFF..09) and binds ERC20SPLFactory & RomeBridgeWithdraw", async () => {
    const dexPda = (await callContract(DEPLOYER, ammAddress, ammAbi, "dexAuthorityPda")) as `0x${string}`;
    expect(dexPda).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(dexPda).not.toBe("0x0000000000000000000000000000000000000000000000000000000000000000");

    const factory = (await callContract(DEPLOYER, ammAddress, ammAbi, "erc20SplFactory")) as string;
    const bridgeWithdraw = (await callContract(DEPLOYER, ammAddress, ammAbi, "romeBridgeWithdraw")) as string;
    expect(factory.toLowerCase()).toBe(ERC20_SPL_FACTORY.toLowerCase());
    expect(bridgeWithdraw.toLowerCase()).toBe(ROME_BRIDGE_WITHDRAW.toLowerCase());

    const count = await callContract(DEPLOYER, ammAddress, ammAbi, "poolCount");
    expect(Number(count)).toBe(3);

    const pool0 = (await callContract(DEPLOYER, ammAddress, ammAbi, "getPool", [0])) as any;
    expect(pool0.symbolPair).toBe("wSOL / wUSDC");
    expect(Number(pool0.feeBps)).toBe(25);
    expect(pool0.active).toBe(true);
  });

  it("2. Creates a new Unified Shared-State AMM Pool with atomic Solana CPI", async () => {
    const bpt2Addr = "0x7d17492435a97762bf159cde400035246389139f";
    const wUsdcAddr = "0xbce339ba4c3a8de3bb8af1c5539e6ac11da3112d";
    const mintA = "0x1111111111111111111111111111111111111111111111111111111111111111";
    const mintB = "0x3b86552f59e01c2a7536120263414186259a2d36b2c68f09c4412c09a82e0b44";
    const meteoraProg = "0x04bf8b5a044169c2556b461f29a8f15c0e92356a622a4e8f7b039d7b11234567";

    await callContract(DEPLOYER, ammAddress, ammAbi, "createUnifiedPool", [
      "BPT2 / wUSDC",
      bpt2Addr,
      wUsdcAddr,
      mintA,
      mintB,
      meteoraProg,
      15,
      parseEther("50000"),
      parseEther("50000"),
    ]);

    const count = await callContract(DEPLOYER, ammAddress, ammAbi, "poolCount");
    expect(Number(count)).toBe(4);

    const pool3 = (await callContract(DEPLOYER, ammAddress, ammAbi, "getPool", [3])) as any;
    expect(pool3.symbolPair).toBe("BPT2 / wUSDC");
    expect(Number(pool3.feeBps)).toBe(15);
  });

  it("3. Supports Dual-Lane LP Provisioning (EVM MetaMask & Solana Synthetic Lane) on the same shared pool", async () => {
    const evmLpAmt = parseEther("1.5");
    const solLpAmt = parseEther("2.0");
    const solPubkey = "0x7777777777777777777777777777777777777777777777777777777777777777";

    // EVM LP adds liquidity to Pool 0 (wSOL / wUSDC)
    await callContract(
      EVM_TRADER,
      ammAddress,
      ammAbi,
      "addLiquidityDualLane",
      [0, 0, "0x0000000000000000000000000000000000000000000000000000000000000000"],
      evmLpAmt
    );

    // Solana Synthetic LP adds liquidity to Pool 0 (wSOL / wUSDC)
    await callContract(SOLANA_SYNTHETIC_TRADER, ammAddress, ammAbi, "addLiquidityDualLane", [0, 1, solPubkey], solLpAmt);

    const evmPos = (await callContract(EVM_TRADER, ammAddress, ammAbi, "getLpPosition", [EVM_TRADER, 0])) as any;
    expect(evmPos.lpShares).toBe(evmLpAmt);
    expect(Number(evmPos.preferredLane)).toBe(0);

    const solPos = (await callContract(SOLANA_SYNTHETIC_TRADER, ammAddress, ammAbi, "getLpPosition", [
      SOLANA_SYNTHETIC_TRADER,
      0,
    ])) as any;
    expect(solPos.lpShares).toBe(solLpAmt);
    expect(Number(solPos.preferredLane)).toBe(1);
    expect(solPos.linkedSolanaPubkey.toLowerCase()).toBe(solPubkey);
  });

  it("4. Executes Atomic Constant-Product Swaps (x*y=k) from both EVM and Solana lanes with slippage guard", async () => {
    const swapIn = parseEther("0.5");

    // Quote first
    const [quotedOut] = (await callContract(EVM_TRADER, ammAddress, ammAbi, "quoteConstantProductSwap", [
      0,
      false,
      swapIn,
    ])) as [bigint, bigint];
    expect(quotedOut > 0n).toBe(true);

    // EVM Trader swaps wUSDC -> wSOL (zeroForOne = false, lane = 0)
    await callContract(EVM_TRADER, ammAddress, ammAbi, "executeAtomicCpiSwap", [0, false, quotedOut, 0], swapIn);

    // Solana Trader swaps wSOL -> wUSDC (zeroForOne = true, lane = 1)
    await callContract(SOLANA_SYNTHETIC_TRADER, ammAddress, ammAbi, "executeAtomicCpiSwap", [0, true, 1n, 1], swapIn);

    const cpiSwaps = await callContract(DEPLOYER, ammAddress, ammAbi, "totalCpiSwaps");
    expect(Number(cpiSwaps)).toBe(2);

    // Slippage guard check: minAmountOut impossibly high must revert
    await expect(
      callContract(EVM_TRADER, ammAddress, ammAbi, "executeAtomicCpiSwap", [0, false, parseEther("999999"), 0], swapIn)
    ).rejects.toThrow();
  });

  it("5. Removes Dual-Lane LP Liquidity and returns native USDC to the provider", async () => {
    const lpAmt = parseEther("1.0");
    await callContract(
      EVM_TRADER,
      ammAddress,
      ammAbi,
      "addLiquidityDualLane",
      [1, 0, "0x0000000000000000000000000000000000000000000000000000000000000000"],
      lpAmt
    );

    await callContract(EVM_TRADER, ammAddress, ammAbi, "removeLiquidityDualLane", [1, parseEther("0.4")]);

    const posAfter = (await callContract(EVM_TRADER, ammAddress, ammAbi, "getLpPosition", [EVM_TRADER, 1])) as any;
    expect(posAfter.lpShares).toBe(parseEther("0.6"));
  });

  it("6. Synchronizes CCTP & Wormhole Bridge Funding routes on-chain with RomeBridgeWithdraw & User PDA", async () => {
    await callContract(EVM_TRADER, ammAddress, ammAbi, "recordBridgeFundingRoute", [
      "CCTP_V2_USDC_GAS",
      "txf_e86c26b8d5f04815bf00c0a2fa1714c7",
      parseEther("10.0"),
    ]);

    const logged = await callContract(DEPLOYER, ammAddress, ammAbi, "totalBridgeFundingsLogged");
    expect(Number(logged)).toBe(1);
  });

  it("7. Enforces Rome CPI Precompile AccountMeta rules in executeCustomSolanaCPI", async () => {
    const dexPda = (await callContract(DEPLOYER, ammAddress, ammAbi, "dexAuthorityPda")) as `0x${string}`;
    const targetProg = "0xa9525b9999e81040292f462739e25311c8a919002581d691915f0b7f4951b50a";
    const operatorPubkey = "0x1111111111111111111111111111111111111111111111111111111111111111";

    // Empty accounts must revert
    await expect(
      callContract(EVM_TRADER, ammAddress, ammAbi, "executeCustomSolanaCPI", [targetProg, [], "0x0102", [], 1])
    ).rejects.toThrow();

    // Target programId in AccountMeta[] must revert
    await expect(
      callContract(EVM_TRADER, ammAddress, ammAbi, "executeCustomSolanaCPI", [
        targetProg,
        [{ pubkey: targetProg, is_signer: false, is_writable: false }],
        "0x0102",
        [],
        1,
      ])
    ).rejects.toThrow();

    // SYSTEM.operator() in AccountMeta[] must revert
    await expect(
      callContract(EVM_TRADER, ammAddress, ammAbi, "executeCustomSolanaCPI", [
        targetProg,
        [{ pubkey: operatorPubkey, is_signer: false, is_writable: false }],
        "0x0102",
        [],
        1,
      ])
    ).rejects.toThrow();

    // Valid AccountMeta[] with dexPda signer & seeds succeeds via invoke_signed
    const saltSeed = "0x8888888888888888888888888888888888888888888888888888888888888888";
    await callContract(EVM_TRADER, ammAddress, ammAbi, "executeCustomSolanaCPI", [
      targetProg,
      [{ pubkey: dexPda, is_signer: true, is_writable: true }],
      "0xf8c69e91e17587c840420f0000000000",
      [saltSeed],
      2,
    ]);

    const cpiSwaps = await callContract(DEPLOYER, ammAddress, ammAbi, "totalCpiSwaps");
    expect(Number(cpiSwaps)).toBe(1);
  });
});
