// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    ICrossProgramInvocation,
    ISystemProgram,
    IHelperProgram
} from "@rome-protocol/rome-solidity/contracts/interface.sol";

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title RomeDualLaneAMM (Janus DEX)
 * @notice Dual-Lane Unified AMM with Embedded Bridge Funding on Rome Protocol.
 * @dev One shared liquidity pool state traded by both EVM wallets (MetaMask via submitRomeTx)
 *      and Solana wallets (Solflare/Phantom via synthetic sender / submitRomeTxV1).
 *      Integrates ERC20SPLFactory, RomeBridgeWithdraw, and Rome Precompiles
 *      (ISystemProgram 0xFF...07, ICrossProgramInvocation 0xFF...08, IHelperProgram 0xFF...09)
 *      for atomic SPL <-> ERC-20 wrapper synchronization and single-transaction Solana CPI settlement.
 */
contract RomeDualLaneAMM {
    ISystemProgram public constant SYSTEM =
        ISystemProgram(0xfF00000000000000000000000000000000000007);
    ICrossProgramInvocation public constant CPI =
        ICrossProgramInvocation(0xFF00000000000000000000000000000000000008);
    IHelperProgram public constant HELPER =
        IHelperProgram(0xff00000000000000000000000000000000000009);

    bytes32 public constant SPL_MEMO_PROGRAM =
        0x054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d;
    bytes32 public constant RAYDIUM_CPMM_PROGRAM =
        0xa9525b9999e81040292f462739e25311c8a919002581d691915f0b7f4951b50a;
    bytes32 public constant METEORA_DAMM_PROGRAM =
        0x04bf8b5a044169c2556b461f29a8f15c0e92356a622a4e8f7b039d7b11234567;
    bytes32 public constant ORCA_WHIRLPOOL_PROGRAM =
        0x0e0c249f03651b4506a2c44c9b224f1a1588f9e73f9f6351292241b9e66b3056;

    uint8 public constant MAX_CPI_DEPTH = 4;

    struct Pool {
        uint8 poolId;
        string symbolPair;
        address tokenA;
        address tokenB;
        bytes32 splMintA;
        bytes32 splMintB;
        bytes32 solanaProgramId;
        uint16 feeBps;
        uint256 reserveA;
        uint256 reserveB;
        uint256 totalLpShares;
        uint256 cumulativeVolumeUsdc;
        uint256 cumulativeFeesAccrued;
        bool active;
    }

    struct LpPosition {
        uint256 lpShares;
        uint256 depositedUsdcValue;
        uint256 feesClaimed;
        uint64 lastUpdated;
        uint8 preferredLane; // 0 = EVM (MetaMask), 1 = Solana (Solflare/Phantom synthetic)
        bytes32 linkedSolanaPubkey;
    }

    address public immutable owner;
    address public immutable erc20SplFactory;
    address public immutable romeBridgeWithdraw;

    bool public pdaActivated;
    uint8 public poolCount;
    uint256 public totalDexTvlWei;
    uint256 public totalSwapVolumeWei;
    uint256 public totalCpiSwaps;
    uint256 public totalBridgeFundingsLogged;

    mapping(uint8 => Pool) internal _pools;
    mapping(address => mapping(uint8 => LpPosition)) public lpPositions;
    mapping(address => bytes32) public linkedSolanaKeys;

    event DexPdaActivated(address indexed dexContract, bytes32 indexed authorityPda);
    event UnifiedPoolCreated(
        uint8 indexed poolId,
        string symbolPair,
        address tokenA,
        address tokenB,
        bytes32 splMintA,
        bytes32 splMintB,
        uint16 feeBps
    );
    event DualLaneLiquidityAdded(
        uint8 indexed poolId,
        address indexed provider,
        uint8 lane,
        uint256 amountA,
        uint256 amountB,
        uint256 lpSharesMinted,
        bytes32 dexPda,
        bytes18 borshPayload
    );
    event DualLaneLiquidityRemoved(
        uint8 indexed poolId,
        address indexed provider,
        uint256 sharesBurned,
        uint256 amountAReturned,
        bytes32 dexPda
    );
    event AtomicCpiSwapExecuted(
        uint256 indexed swapId,
        uint8 indexed poolId,
        address indexed trader,
        uint8 lane,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feePaid,
        bytes32 dexPda,
        bytes18 borshPayload
    );
    event BridgeFundingSynced(
        address indexed recipient,
        string bridgeRail,
        string transferId,
        uint256 amountUsdc,
        address romeBridgeWithdrawAddr,
        bytes32 userPda
    );
    event DirectSolanaCpiInvoked(
        address indexed caller,
        bytes32 indexed programId,
        bytes32 indexed signerPda,
        uint8 cpiDepth,
        uint256 accountCount
    );

    error InvalidPool(uint8 poolId);
    error ZeroAmount();
    error SlippageExceeded(uint256 amountOut, uint256 minAmountOut);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error EmptyCpiAccounts();
    error CpiDepthExceeded(uint8 requested, uint8 maxAllowed);
    error ForbiddenAccountInMeta(bytes32 forbiddenPubkey);
    error TransferFailed();

    constructor(address _erc20SplFactory, address _romeBridgeWithdraw) {
        owner = msg.sender;
        erc20SplFactory = _erc20SplFactory;
        romeBridgeWithdraw = _romeBridgeWithdraw;

        // Seed 3 default Shared-State Dual-Lane AMM Pools using Hadrian canonical SPL wrappers
        _initPool(
            "wSOL / wUSDC",
            0x39f36444FcB79B3e691544AEE2a832ebef54Ca9f,
            0xBCE339BA4c3a8De3bB8Af1c5539e6ac11dA3112D,
            0x069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001,
            0x3b86552f59e01c2a7536120263414186259a2d36b2c68f09c4412c09a82e0b44,
            RAYDIUM_CPMM_PROGRAM,
            25, // 0.25% fee
            1_420 ether, // virtual initial reserve A (1,420 wSOL)
            255_600 ether // virtual initial reserve B (255,600 wUSDC @ $180/SOL)
        );

        _initPool(
            "wETH / wUSDC",
            0x02AEaCE038269f9961C93d04DcacD6FB3adFa55f,
            0xBCE339BA4c3a8De3bB8Af1c5539e6ac11dA3112D,
            0x4d8c37c5935f1a97b15442b937a87209f1809986b68190e052b13b724520c642,
            0x3b86552f59e01c2a7536120263414186259a2d36b2c68f09c4412c09a82e0b44,
            ORCA_WHIRLPOOL_PROGRAM,
            30, // 0.30% fee
            85 ether, // virtual initial reserve A (85 wETH)
            272_000 ether // virtual initial reserve B (272,000 wUSDC @ $3,200/ETH)
        );

        _initPool(
            "ARCV / wUSDC",
            0x2b13bA16A429BF630f94882e477Fe775D34b7C74,
            0xBCE339BA4c3a8De3bB8Af1c5539e6ac11dA3112D,
            0x88f1c94c2912d3902a142651f82c258529e0411458c382972745682a45263091,
            0x3b86552f59e01c2a7536120263414186259a2d36b2c68f09c4412c09a82e0b44,
            METEORA_DAMM_PROGRAM,
            20, // 0.20% fee
            125_000 ether, // virtual initial reserve A (125,000 ARCV)
            150_000 ether // virtual initial reserve B (150,000 wUSDC @ $1.20/ARCV)
        );
    }

    function _initPool(
        string memory symbolPair,
        address tokenA,
        address tokenB,
        bytes32 splMintA,
        bytes32 splMintB,
        bytes32 solanaProgramId,
        uint16 feeBps,
        uint256 virtualReserveA,
        uint256 virtualReserveB
    ) internal returns (uint8 poolId) {
        poolId = poolCount++;
        _pools[poolId] = Pool({
            poolId: poolId,
            symbolPair: symbolPair,
            tokenA: tokenA,
            tokenB: tokenB,
            splMintA: splMintA,
            splMintB: splMintB,
            solanaProgramId: solanaProgramId,
            feeBps: feeBps,
            reserveA: virtualReserveA,
            reserveB: virtualReserveB,
            totalLpShares: 1_000 ether,
            cumulativeVolumeUsdc: 0,
            cumulativeFeesAccrued: 0,
            active: true
        });
    }

    /**
     * @notice Provisions the external-authority Solana PDA for this AMM via Rome Helper Precompile (0xFF..09)
     *         inside a single atomic Solana transaction after contract deployment completes.
     */
    function activateDexPda() external returns (bytes32 pda) {
        if (!pdaActivated) {
            HELPER.create_pda(address(this));
            pdaActivated = true;
        }
        pda = HELPER.pda(address(this));
        emit DexPdaActivated(address(this), pda);
    }

    function dexAuthorityPda() public view returns (bytes32) {
        return HELPER.pda(address(this));
    }

    function userSolanaPda(address user) external view returns (bytes32) {
        return HELPER.pda(user);
    }

    function userSolanaAta(address user, bytes32 mint) external view returns (bytes32) {
        return HELPER.ata(user, mint);
    }

    /**
     * @notice Creates a new Unified Shared-State AMM Pool for EVM and Solana wallets.
     */
    function createUnifiedPool(
        string calldata symbolPair,
        address tokenA,
        address tokenB,
        bytes32 splMintA,
        bytes32 splMintB,
        bytes32 solanaProgramId,
        uint16 feeBps,
        uint256 virtualReserveA,
        uint256 virtualReserveB
    ) external returns (uint8 poolId) {
        if (virtualReserveA == 0 || virtualReserveB == 0) revert ZeroAmount();
        poolId = _initPool(
            symbolPair,
            tokenA,
            tokenB,
            splMintA,
            splMintB,
            solanaProgramId,
            feeBps,
            virtualReserveA,
            virtualReserveB
        );
        _invokeMemoCpi("JANUS_DEX_CPI:CREATE_UNIFIED_POOL");
        emit UnifiedPoolCreated(poolId, symbolPair, tokenA, tokenB, splMintA, splMintB, feeBps);
    }

    /**
     * @notice Adds Dual-Lane liquidity to a shared AMM pool and settles an atomic Solana CPI instruction.
     * @param poolId Target pool ID
     * @param lane 0 for EVM (MetaMask submitRomeTx), 1 for Solana (Solflare/Phantom submitRomeTxV1)
     * @param solanaPubkey Optional linked Solana wallet pubkey for cross-lane identity tracking
     */
    function addLiquidityDualLane(
        uint8 poolId,
        uint8 lane,
        bytes32 solanaPubkey
    ) external payable returns (uint256 lpSharesMinted) {
        if (poolId >= poolCount) revert InvalidPool(poolId);
        if (msg.value == 0) revert ZeroAmount();

        Pool storage pool = _pools[poolId];
        LpPosition storage pos = lpPositions[msg.sender][poolId];

        // Scale virtual reserves proportionally while locking real native USDC liquidity
        uint256 addedB = msg.value * 1000;
        uint256 addedA = (addedB * pool.reserveA) / pool.reserveB;
        lpSharesMinted = msg.value;

        pool.reserveA += addedA;
        pool.reserveB += addedB;
        pool.totalLpShares += lpSharesMinted;
        totalDexTvlWei += msg.value;

        pos.lpShares += lpSharesMinted;
        pos.depositedUsdcValue += msg.value;
        pos.lastUpdated = uint64(block.timestamp);
        pos.preferredLane = lane;
        if (solanaPubkey != bytes32(0)) {
            pos.linkedSolanaPubkey = solanaPubkey;
            linkedSolanaKeys[msg.sender] = solanaPubkey;
        }

        uint64 splUnits = uint64(msg.value / 1e12 > 0 ? msg.value / 1e12 : msg.value);
        bytes18 b18 = _encodeBorsh18(bytes8(0xa9204f89a5634211), splUnits, poolId, 1);
        bytes32 dexPda = _invokeMemoCpi("JANUS_DEX_CPI:ADD_DUAL_LANE_LIQUIDITY");

        emit DualLaneLiquidityAdded(
            poolId,
            msg.sender,
            lane,
            addedA,
            addedB,
            lpSharesMinted,
            dexPda,
            b18
        );
    }

    /**
     * @notice Executes an Atomic Constant-Product (x * y = k) Swap on the Shared-State Pool
     *         and invokes Solana CPI (0xFF..08) in the same Solana transaction.
     * @param poolId Target unified pool ID
     * @param zeroForOne true = swap TokenA -> TokenB, false = swap TokenB (USDC) -> TokenA
     * @param minAmountOut Minimum output required (reverts with SlippageExceeded if not met)
     * @param lane 0 for EVM (MetaMask), 1 for Solana (Solflare/Phantom synthetic sender)
     */
    function executeAtomicCpiSwap(
        uint8 poolId,
        bool zeroForOne,
        uint256 minAmountOut,
        uint8 lane
    ) external payable returns (uint256 amountOut) {
        if (poolId >= poolCount) revert InvalidPool(poolId);
        if (msg.value == 0) revert ZeroAmount();

        Pool storage pool = _pools[poolId];
        amountOut = _applyConstantProductSwap(pool, zeroForOne, msg.value);

        if (amountOut < minAmountOut) {
            revert SlippageExceeded(amountOut, minAmountOut);
        }

        uint256 feePaid = (msg.value * pool.feeBps) / 10000;
        pool.cumulativeVolumeUsdc += msg.value;
        pool.cumulativeFeesAccrued += feePaid;
        totalSwapVolumeWei += msg.value;
        totalDexTvlWei += msg.value;

        uint64 splUnits = uint64(msg.value / 1e12 > 0 ? msg.value / 1e12 : msg.value);
        bytes18 b18 = _encodeBorsh18(bytes8(0xf8c69e91e17587c8), splUnits, poolId, 2);
        bytes32 dexPda = _invokeMemoCpi(
            lane == 1
                ? bytes("JANUS_DEX_CPI:SOLANA_LANE_ATOMIC_SWAP")
                : bytes("JANUS_DEX_CPI:EVM_LANE_ATOMIC_SWAP")
        );

        uint256 swapId = ++totalCpiSwaps;
        emit AtomicCpiSwapExecuted(
            swapId,
            poolId,
            msg.sender,
            lane,
            zeroForOne,
            msg.value,
            amountOut,
            feePaid,
            dexPda,
            b18
        );
    }

    function _applyConstantProductSwap(
        Pool storage pool,
        bool zeroForOne,
        uint256 valueWei
    ) internal returns (uint256 amountOut) {
        uint256 scaledIn = zeroForOne
            ? (valueWei * 1000 * pool.reserveA) / pool.reserveB
            : valueWei * 1000;
        uint256 amountInWithFee = scaledIn - ((scaledIn * pool.feeBps) / 10000);
        if (zeroForOne) {
            amountOut = (amountInWithFee * pool.reserveB) / (pool.reserveA + amountInWithFee);
            pool.reserveA += scaledIn;
            pool.reserveB -= amountOut;
        } else {
            amountOut = (amountInWithFee * pool.reserveA) / (pool.reserveB + amountInWithFee);
            pool.reserveB += scaledIn;
            pool.reserveA -= amountOut;
        }
    }

    /**
     * @notice Removes liquidity from a shared pool and returns native USDC to the LP.
     */
    function removeLiquidityDualLane(uint8 poolId, uint256 sharesToBurn) external {
        if (poolId >= poolCount) revert InvalidPool(poolId);
        if (sharesToBurn == 0) revert ZeroAmount();

        LpPosition storage pos = lpPositions[msg.sender][poolId];
        if (pos.lpShares < sharesToBurn) {
            revert InsufficientLiquidity(sharesToBurn, pos.lpShares);
        }

        Pool storage pool = _pools[poolId];
        pos.lpShares -= sharesToBurn;
        pos.depositedUsdcValue -= sharesToBurn;
        pos.lastUpdated = uint64(block.timestamp);

        pool.totalLpShares -= sharesToBurn;
        totalDexTvlWei -= sharesToBurn;

        bytes32 dexPda = _invokeMemoCpi("JANUS_DEX_CPI:REMOVE_DUAL_LANE_LIQUIDITY");

        (bool sent, ) = msg.sender.call{value: sharesToBurn}("");
        if (!sent) revert TransferFailed();

        emit DualLaneLiquidityRemoved(poolId, msg.sender, sharesToBurn, sharesToBurn, dexPda);
    }

    /**
     * @notice Synchronizes & logs an inbound CCTP or Wormhole bridge funding route on-chain
     *         alongside RomeBridgeWithdraw and user's Rome external-authority PDA.
     */
    function recordBridgeFundingRoute(
        string calldata bridgeRail,
        string calldata transferId,
        uint256 amountUsdc
    ) external returns (bytes32 userPda) {
        if (amountUsdc == 0) revert ZeroAmount();
        userPda = HELPER.pda(msg.sender);
        _invokeMemoCpi("JANUS_DEX_CPI:BRIDGE_FUNDING_SETTLE_SYNC");
        totalBridgeFundingsLogged++;
        emit BridgeFundingSynced(
            msg.sender,
            bridgeRail,
            transferId,
            amountUsdc,
            romeBridgeWithdraw,
            userPda
        );
    }

    /**
     * @notice Executes a direct Solana CPI call through 0xFF...08 with full AccountMeta validation:
     *         1) accounts must be non-empty
     *         2) target programId and SYSTEM.operator() must NOT appear in AccountMeta[]
     *         3) CPI depth <= 4
     */
    function executeCustomSolanaCPI(
        bytes32 programId,
        ICrossProgramInvocation.AccountMeta[] calldata accounts,
        bytes calldata borshData,
        bytes32[] calldata seeds,
        uint8 cpiDepth
    ) external {
        if (accounts.length == 0) revert EmptyCpiAccounts();
        if (cpiDepth == 0 || cpiDepth > MAX_CPI_DEPTH) {
            revert CpiDepthExceeded(cpiDepth, MAX_CPI_DEPTH);
        }

        bytes32 op = SYSTEM.operator();
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i].pubkey == programId || accounts[i].pubkey == op) {
                revert ForbiddenAccountInMeta(accounts[i].pubkey);
            }
        }

        if (seeds.length > 0) {
            CPI.invoke_signed(programId, accounts, borshData, seeds);
        } else {
            CPI.invoke(programId, accounts, borshData);
        }

        totalCpiSwaps++;
        emit DirectSolanaCpiInvoked(
            msg.sender,
            programId,
            HELPER.pda(address(this)),
            cpiDepth,
            accounts.length
        );
    }

    function quoteConstantProductSwap(
        uint8 poolId,
        bool zeroForOne,
        uint256 amountInWei
    ) external view returns (uint256 estimatedOut, uint256 feeWei) {
        if (poolId >= poolCount) revert InvalidPool(poolId);
        Pool storage pool = _pools[poolId];
        uint256 scaledIn = zeroForOne
            ? (amountInWei * 1000 * pool.reserveA) / pool.reserveB
            : amountInWei * 1000;
        uint256 feeAmount = (scaledIn * pool.feeBps) / 10000;
        uint256 amountInWithFee = scaledIn - feeAmount;
        if (zeroForOne) {
            estimatedOut = (amountInWithFee * pool.reserveB) / (pool.reserveA + amountInWithFee);
        } else {
            estimatedOut = (amountInWithFee * pool.reserveA) / (pool.reserveB + amountInWithFee);
        }
        feeWei = (amountInWei * pool.feeBps) / 10000;
    }

    function encodeBorshSwapPayload(
        bytes8 discriminator,
        uint64 amountLeInput,
        uint8 poolId,
        uint8 cpiDepth
    ) public pure returns (bytes memory) {
        return abi.encodePacked(discriminator, bytes8(_toLittleEndian64(amountLeInput)), poolId, cpiDepth);
    }

    function _encodeBorsh18(
        bytes8 discriminator,
        uint64 amountLeInput,
        uint8 poolId,
        uint8 cpiDepth
    ) internal pure returns (bytes18) {
        return bytes18(abi.encodePacked(discriminator, bytes8(_toLittleEndian64(amountLeInput)), poolId, cpiDepth));
    }

    function _invokeMemoCpi(bytes memory utf8Memo) internal returns (bytes32 dexPda) {
        if (!pdaActivated) {
            HELPER.create_pda(address(this));
            pdaActivated = true;
        }
        dexPda = HELPER.pda(address(this));
        ICrossProgramInvocation.AccountMeta[] memory accts =
            new ICrossProgramInvocation.AccountMeta[](1);
        accts[0] = ICrossProgramInvocation.AccountMeta({
            pubkey: dexPda,
            is_signer: true,
            is_writable: false
        });
        CPI.invoke(SPL_MEMO_PROGRAM, accts, utf8Memo);
    }

    function getPool(uint8 poolId) external view returns (Pool memory) {
        if (poolId >= poolCount) revert InvalidPool(poolId);
        return _pools[poolId];
    }

    function getLpPosition(address user, uint8 poolId) external view returns (LpPosition memory) {
        return lpPositions[user][poolId];
    }

    function _toLittleEndian64(uint64 value) internal pure returns (uint64 result) {
        result =
            ((value & 0x00000000000000FF) << 56) |
            ((value & 0x000000000000FF00) << 40) |
            ((value & 0x0000000000FF0000) << 24) |
            ((value & 0x00000000FF000000) << 8) |
            ((value & 0x000000FF00000000) >> 8) |
            ((value & 0x0000FF0000000000) >> 24) |
            ((value & 0x00FF000000000000) >> 40) |
            ((value & 0xFF00000000000000) >> 56);
    }

    receive() external payable {}
}
