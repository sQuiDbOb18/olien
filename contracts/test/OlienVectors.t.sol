// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {OlienHash} from "../../src/olien/OlienHash.sol";
import {PackedUserOperation, IAccountExecute} from "../../src/olien/IEntryPoint.sol";
import {Call} from "../../src/olien/IOlien.sol";
import {Olien} from "../../src/olien/Olien.sol";

/// @dev Library functions with calldata parameters need an external frame to be called on memory.
contract VectorHelper {
    function userOp(bytes32 domain, PackedUserOperation calldata op, uint48 validAfter, uint48 validUntil, uint64 epoch, address entryPoint)
        external
        pure
        returns (bytes32)
    {
        return OlienHash.userOperation(domain, op, validAfter, validUntil, epoch, entryPoint);
    }
}

/// Fixed inputs whose outputs the backend's Rust reimplementation is held to
/// (backend/src/services/olien.rs, `user_operation_hash` tests). Change nothing here
/// without changing the Rust test to match; the numbers below are what this printed.
contract OlienVectorsTest is Test {
    function test_userOperationVector() public {
        vm.chainId(5042002);
        address account = 0x00000000000000000000000000000000000000AB;
        address entryPoint = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
        bytes32 hash = keccak256("proposal");

        Call[] memory calls = new Call[](1);
        calls[0] = Call(account, 0, abi.encodeCall(Olien.veto, (hash)));
        bytes memory callData = abi.encodeWithSelector(IAccountExecute.executeUserOp.selector, calls);

        PackedUserOperation memory op;
        op.sender = account;
        op.nonce = 7;
        op.callData = callData;
        op.accountGasLimits = bytes32((uint256(500_000) << 128) | 300_000);
        op.preVerificationGas = 60_000;
        op.gasFees = bytes32((uint256(1 gwei) << 128) | 2 gwei);

        bytes32 domain = OlienHash.domain(account);
        bytes32 result = new VectorHelper().userOp(domain, op, 0, 1_800_000_000, 3, entryPoint);
        emit log_named_bytes32("domain", domain);
        emit log_named_bytes("callData", callData);
        emit log_named_bytes32("userOperationHash", result);
    }
}
