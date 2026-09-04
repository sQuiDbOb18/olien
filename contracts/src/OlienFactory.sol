// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

import {Olien} from "./Olien.sol";
import {OlienProxy} from "./OlienProxy.sol";
import {Init} from "./IOlien.sol";

/// @title OlienFactory
/// @notice Deploys accounts at addresses anyone can compute from the first signer set
///         and a salt, so money can arrive before the account exists and can only ever
///         be controlled by those signers. Also serves as an ERC-4337 `initCode` target.
contract OlienFactory {
    address public immutable implementation;

    event AccountCreated(address indexed account, bytes32 salt);

    constructor(address implementation_) {
        implementation = implementation_;
    }

    function createAccount(Init calldata init, bytes32 salt) external returns (address account) {
        bytes memory code = _creationCode(init);
        account = Create2.computeAddress(salt, keccak256(code));
        if (account.code.length != 0) return account;
        account = Create2.deploy(0, salt, code);
        emit AccountCreated(account, salt);
    }

    function getAddress(Init calldata init, bytes32 salt) external view returns (address) {
        return Create2.computeAddress(salt, keccak256(_creationCode(init)));
    }

    function _creationCode(Init calldata init) private view returns (bytes memory) {
        bytes memory initializer = abi.encodeCall(Olien.initialize, (init));
        return abi.encodePacked(type(OlienProxy).creationCode, abi.encode(implementation, initializer));
    }
}
