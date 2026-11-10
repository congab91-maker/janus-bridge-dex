// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title ICrossProgramInvocation
 * @notice Rome EVM CPI Precompile (0xFF00000000000000000000000000000000000008)
 * @dev Enables Solidity contracts to invoke Solana programs atomically within one Solana transaction.
 */
interface ICrossProgramInvocation {
    struct AccountMeta {
        bytes32 pubkey;
        bool is_signer;
        bool is_writable;
    }

    struct PdaResult {
        bytes32 pda;
        uint8 bump;
    }

    function invoke(
        bytes32 program_id,
        AccountMeta[] memory accounts,
        bytes memory data
    ) external;

    function invoke_signed(
        bytes32 program_id,
        AccountMeta[] memory accounts,
        bytes memory data,
        bytes32[] memory seeds
    ) external;

    function account_info(bytes32 pubkey)
        external
        view
        returns (
            uint64 lamports,
            bytes32 owner,
            bool is_signer,
            bool is_writable,
            bool executable,
            bytes memory data
        );

    function account_data_at(
        bytes32 pubkey,
        uint16 offset,
        uint16 length
    ) external view returns (bytes memory);

    function account_u64_at(bytes32 pubkey, uint16 offset)
        external
        view
        returns (uint64);

    function account_lamports(bytes32 pubkey) external view returns (uint64);

    function pdas_batch_derive(
        bytes[][] memory seed_groups,
        bytes32 program_id
    ) external view returns (PdaResult[] memory);
}

/**
 * @title ISystemProgram
 * @notice Rome EVM System Precompile (0xFF00000000000000000000000000000000000007)
 * @dev PDA derivation, Base58 conversion, and chain/program metadata.
 */
interface ISystemProgram {
    struct SeedItem {
        bytes item;
    }

    function program_id() external view returns (bytes32);

    function rome_evm_program_id() external view returns (bytes32);

    function find_program_address(
        bytes32 program,
        SeedItem[] memory seeds
    ) external pure returns (bytes32, uint8);

    function bytes32_to_base58(bytes32 key) external view returns (bytes memory);

    function base58_to_bytes32(bytes memory b58) external view returns (bytes32);

    function operator() external view returns (bytes32);

    function mint_id() external view returns (bytes32);
}

/**
 * @title IHelperProgram
 * @notice Rome EVM Helper Precompile (0xFF00000000000000000000000000000000000009)
 * @dev External-authority PDA management, ATA derivation, and SPL token plumbing.
 */
interface IHelperProgram {
    function create_ata(address user) external;

    function create_ata(address user, bytes32 mint) external;

    function create_ata_for_key(bytes32 wallet, bytes32 mint) external;

    function create_pda(address user) external;

    function create_pda(address user, uint64 lamports) external;

    function swap_gas_to_lamports(uint64 lamports) external;

    function transfer_lamports(address to, uint64 lamports) external;

    function transfer_spl(address to, uint64 tokens) external;

    function transfer_spl(bytes32 to_ata, uint64 tokens) external;

    function transfer_spl(
        address to,
        uint64 tokens,
        bytes32 mint
    ) external;

    function transfer_spl(
        bytes32 to_ata,
        uint64 tokens,
        bytes32 mint
    ) external;

    function transfer_spl(
        bytes32 src_ata,
        bytes32 to_ata,
        uint64 tokens,
        bytes32 mint
    ) external;

    function transfer_spl(
        address from,
        address to,
        uint64 tokens,
        bytes32 mint
    ) external;

    function transfer_spl_to_signer(uint64 amount, bytes32 mint) external;

    function approve_spl(
        address spender,
        uint64 amount,
        bytes32 mint
    ) external;

    function mint_spl(
        address to,
        uint64 amount,
        bytes32 mint
    ) external;

    function deposit_from_ata(uint256 wei_) external;

    function pda(address user) external view returns (bytes32);

    function pda_with_salt(address user, bytes32 salt)
        external
        view
        returns (bytes32);

    function ata(address user) external view returns (bytes32);

    function ata(address user, bytes32 mint) external view returns (bytes32);

    function user_balance(address account, bytes32 mint)
        external
        view
        returns (uint64);

    function allowance_of(
        address owner,
        address spender,
        bytes32 mint
    ) external view returns (uint64);
}
