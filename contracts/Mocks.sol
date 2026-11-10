// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ICrossProgramInvocation} from "@rome-protocol/rome-solidity/contracts/interface.sol";

contract MockRomeSystemPrecompile {
    bytes32 public constant MOCK_OPERATOR =
        0x1111111111111111111111111111111111111111111111111111111111111111;

    function operator() external pure returns (bytes32) {
        return MOCK_OPERATOR;
    }

    function program_id() external pure returns (bytes32) {
        return 0x2222222222222222222222222222222222222222222222222222222222222222;
    }

    function rome_evm_program_id() external pure returns (bytes32) {
        return 0x3333333333333333333333333333333333333333333333333333333333333333;
    }

    function mint_id() external pure returns (bytes32) {
        return 0x4444444444444444444444444444444444444444444444444444444444444444;
    }
}

contract MockRomeHelperPrecompile {
    mapping(address => bool) public pdaCreated;

    function create_pda(address user) external {
        pdaCreated[user] = true;
    }

    function pda(address user) external pure returns (bytes32) {
        return keccak256(abi.encodePacked("ROME_EXTERNAL_AUTH_PDA", user));
    }

    function ata(address user) external pure returns (bytes32) {
        return keccak256(abi.encodePacked("ROME_ATA", user));
    }

    function ata(address user, bytes32 mint) external pure returns (bytes32) {
        return keccak256(abi.encodePacked("ROME_ATA", user, mint));
    }
}

contract MockRomeCpiPrecompile {
    uint256 public invokeCount;
    bytes32 public lastProgramId;
    bytes public lastData;
    uint256 public lastAccountCount;

    function invoke(
        bytes32 program_id,
        ICrossProgramInvocation.AccountMeta[] memory accounts,
        bytes memory data
    ) external {
        require(accounts.length > 0, "CPI: accounts empty");
        invokeCount++;
        lastProgramId = program_id;
        lastData = data;
        lastAccountCount = accounts.length;
    }

    function invoke_signed(
        bytes32 program_id,
        ICrossProgramInvocation.AccountMeta[] memory accounts,
        bytes memory data,
        bytes32[] memory seeds
    ) external {
        require(accounts.length > 0, "CPI: accounts empty");
        require(seeds.length > 0, "CPI: seeds empty");
        invokeCount++;
        lastProgramId = program_id;
        lastData = data;
        lastAccountCount = accounts.length;
    }
}
