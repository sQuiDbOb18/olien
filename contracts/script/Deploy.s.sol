// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";

import {Olien} from "../src/olien/Olien.sol";
import {OlienFactory} from "../src/olien/OlienFactory.sol";
import {OlienVerifier} from "../src/olien/OlienVerifier.sol";
import {SubAccount} from "../src/olien/SubAccount.sol";

// Deploys the Olien account protocol: the verifier, the sub-account implementation, the
// account implementation and the factory, each through the deterministic CREATE2 deployer
// with a fixed salt, so the four land at the same addresses on every chain that has that
// deployer and the v0.7 EntryPoint. Records them in the chain's address book.
contract DeployOlien is Script {
    uint256 constant ARC_TESTNET = 5042002;
    address constant ENTRY_POINT_V07 = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    bytes32 constant VERIFIER_SALT = keccak256("olien.v1.verifier");
    bytes32 constant SUB_ACCOUNT_SALT = keccak256("olien.v1.sub-account");
    bytes32 constant IMPLEMENTATION_SALT = keccak256("olien.v1.implementation");
    bytes32 constant FACTORY_SALT = keccak256("olien.v1.factory");

    function run() external {
        require(ENTRY_POINT_V07.code.length != 0, "no EntryPoint v0.7 on this chain");

        // Each address is a pure function of its salt and code, so a piece that is already on
        // the chain is reused rather than deployed again.
        vm.startBroadcast();
        address verifier = _predict(VERIFIER_SALT, type(OlienVerifier).creationCode);
        if (verifier.code.length == 0) verifier = address(new OlienVerifier{salt: VERIFIER_SALT}());
        address subAccount = _predict(SUB_ACCOUNT_SALT, type(SubAccount).creationCode);
        if (subAccount.code.length == 0) subAccount = address(new SubAccount{salt: SUB_ACCOUNT_SALT}());
        address implementation = _predict(
            IMPLEMENTATION_SALT,
            abi.encodePacked(type(Olien).creationCode, abi.encode(ENTRY_POINT_V07, verifier, subAccount))
        );
        if (implementation.code.length == 0) {
            implementation = address(new Olien{salt: IMPLEMENTATION_SALT}(ENTRY_POINT_V07, verifier, subAccount));
        }
        address factory =
            _predict(FACTORY_SALT, abi.encodePacked(type(OlienFactory).creationCode, abi.encode(implementation)));
        if (factory.code.length == 0) factory = address(new OlienFactory{salt: FACTORY_SALT}(implementation));
        vm.stopBroadcast();

        string memory file =
            block.chainid == ARC_TESTNET ? "arc-testnet.json" : string.concat("local-", vm.toString(block.chainid), ".json");
        string memory path = string.concat(vm.projectRoot(), "/../deployments/", file);
        string memory book = "olien";
        vm.serializeAddress(book, "verifier", verifier);
        vm.serializeAddress(book, "subAccountImplementation", subAccount);
        vm.serializeAddress(book, "implementation", implementation);
        vm.serializeAddress(book, "entryPoint", ENTRY_POINT_V07);
        string memory json = vm.serializeAddress(book, "factory", factory);
        vm.writeJson(json, path, ".olien");
    }

    /// @dev The deterministic deployer forge routes salted creations through.
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function _predict(bytes32 salt, bytes memory creationCode) private pure returns (address) {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, salt, keccak256(creationCode)))))
        );
    }
}
