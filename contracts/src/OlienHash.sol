// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Call} from "./IOlien.sol";
import {PackedUserOperation} from "./IEntryPoint.sol";

/// @title OlienHash
/// @notice The EIP-712 hashes an account verifies. Everything a signer ever signs is
///         one of the four structs here, in the account's own domain.
library OlienHash {
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant NAME_HASH = keccak256("Olien");
    bytes32 internal constant VERSION_HASH = keccak256("1");

    bytes32 internal constant CALL_TYPEHASH = keccak256("Call(address to,uint256 value,bytes data)");
    bytes32 internal constant TRANSACTION_TYPEHASH = keccak256(
        "Transaction(uint256 nonce,uint64 epoch,Call[] calls,uint48 validAfter,uint48 validUntil)Call(address to,uint256 value,bytes data)"
    );
    bytes32 internal constant USER_OPERATION_TYPEHASH = keccak256(
        "UserOperation(address sender,uint256 nonce,bytes initCode,bytes callData,uint128 verificationGasLimit,uint128 callGasLimit,uint256 preVerificationGas,uint128 maxPriorityFeePerGas,uint128 maxFeePerGas,bytes paymasterAndData,uint48 validAfter,uint48 validUntil,uint64 epoch,address entryPoint)"
    );
    bytes32 internal constant MESSAGE_TYPEHASH = keccak256("Message(bytes32 hash)");

    function domain(address account) internal view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, account));
    }

    function calls(Call[] memory list) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](list.length);
        for (uint256 i = 0; i < list.length; i++) {
            hashes[i] = keccak256(abi.encode(CALL_TYPEHASH, list[i].to, list[i].value, keccak256(list[i].data)));
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function transaction(
        bytes32 domainSeparator,
        uint256 nonce,
        uint64 epoch,
        Call[] memory list,
        uint48 validAfter,
        uint48 validUntil
    ) internal pure returns (bytes32) {
        bytes32 structHash =
            keccak256(abi.encode(TRANSACTION_TYPEHASH, nonce, epoch, calls(list), validAfter, validUntil));
        return typed(domainSeparator, structHash);
    }

    function userOperation(
        bytes32 domainSeparator,
        PackedUserOperation calldata op,
        uint48 validAfter,
        uint48 validUntil,
        uint64 epoch,
        address entryPoint
    ) internal pure returns (bytes32) {
        // Two encodes joined: one call with fifteen arguments runs out of stack.
        bytes memory head = abi.encode(
            USER_OPERATION_TYPEHASH,
            op.sender,
            op.nonce,
            keccak256(op.initCode),
            keccak256(op.callData),
            uint128(bytes16(op.accountGasLimits)),
            uint128(uint256(op.accountGasLimits)),
            op.preVerificationGas
        );
        bytes memory tail = abi.encode(
            uint128(bytes16(op.gasFees)),
            uint128(uint256(op.gasFees)),
            keccak256(op.paymasterAndData),
            validAfter,
            validUntil,
            epoch,
            entryPoint
        );
        return typed(domainSeparator, keccak256(bytes.concat(head, tail)));
    }

    function message(bytes32 domainSeparator, bytes32 hash) internal pure returns (bytes32) {
        return typed(domainSeparator, keccak256(abi.encode(MESSAGE_TYPEHASH, hash)));
    }

    function typed(bytes32 domainSeparator, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(hex"1901", domainSeparator, structHash));
    }
}
