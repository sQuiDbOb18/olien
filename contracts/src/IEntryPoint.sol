// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// The parts of ERC-4337 v0.7 the account touches, copied rather than imported so the
// account has no dependency beyond OpenZeppelin.

struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

interface IAccount {
    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash, uint256 missingAccountFunds)
        external
        returns (uint256 validationData);
}

/// @dev When an operation's callData starts with this interface's selector, the EntryPoint
///      calls the account with the whole operation and its hash instead of the raw callData.
interface IAccountExecute {
    function executeUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash) external;
}

interface IEntryPoint {
    function handleOps(PackedUserOperation[] calldata ops, address payable beneficiary) external;
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
    function addStake(uint32 unstakeDelaySec) external payable;
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
    function getUserOpHash(PackedUserOperation calldata userOp) external view returns (bytes32);
}
