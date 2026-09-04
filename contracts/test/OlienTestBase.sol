// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {Olien} from "../../src/olien/Olien.sol";
import {OlienFactory} from "../../src/olien/OlienFactory.sol";
import {OlienVerifier} from "../../src/olien/OlienVerifier.sol";
import {OlienHash} from "../../src/olien/OlienHash.sol";
import {SubAccount} from "../../src/olien/SubAccount.sol";
import {PackedUserOperation, IEntryPoint, IAccountExecute} from "../../src/olien/IEntryPoint.sol";
import {
    Call,
    Transaction,
    SignerInput,
    Init,
    KIND_ECDSA,
    KIND_P256,
    KIND_WEBAUTHN,
    KIND_CONTRACT,
    PERM_APPROVE,
    PERM_VETO,
    PERM_RECOVER
} from "../../src/olien/IOlien.sol";

/// @dev A token that behaves like USDC for transfers, with a switch to return false instead.
contract MockToken {
    mapping(address => uint256) public balanceOf;
    bool public returnFalse;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setReturnFalse(bool v) external {
        returnFalse = v;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (returnFalse) return false;
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Library functions with calldata parameters need an external frame to be called on memory.
contract HashHelper {
    function userOp(
        bytes32 domain,
        PackedUserOperation calldata op,
        uint48 validAfter,
        uint48 validUntil,
        uint64 epoch,
        address entryPoint
    ) external pure returns (bytes32) {
        return OlienHash.userOperation(domain, op, validAfter, validUntil, epoch, entryPoint);
    }
}

/// @dev Calls back into the account mid-batch.
contract Reenterer {
    Olien public account;
    Transaction public stored;
    bytes public storedSigs;

    function arm(Olien account_, Transaction calldata txn, bytes calldata sigs) external {
        account = account_;
        stored = txn;
        storedSigs = sigs;
    }

    function poke() external {
        account.execute(stored, storedSigs);
    }
}

abstract contract OlienTestBase is Test {
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address constant SENDER_CREATOR = 0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C;
    address constant PRECOMPILE = address(0x100);
    uint256 constant P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;

    OlienVerifier verifier;
    SubAccount subImpl;
    Olien impl;
    OlienFactory factory;
    MockToken usdc;
    HashHelper hasher;

    uint256 alicePk = 0xA11CE;
    uint256 bobPk = 0xB0B;
    uint256 carolPk = 0xCA201;
    uint256 guardianPk = 0x6A2D;
    address alice;
    address bob;
    address carol;
    address guardian;
    address dave = address(0xDA7E);
    address eve = address(0xE7E);
    address bundler = address(0xB0DD1E);

    uint256 devicePk = 0xDE7;
    uint256 deviceX;
    uint256 deviceY;
    uint256 passkeyPk = 0x9A55;
    uint256 passkeyX;
    uint256 passkeyY;

    function setUp() public virtual {
        vm.etch(ENTRY_POINT, _fixture("test/fixtures/entrypoint-v07.hex"));
        vm.etch(SENDER_CREATOR, _fixture("test/fixtures/entrypoint-v07-sendercreator.hex"));
        // Forge has no P-256 precompile; Daimo's verifier answers exactly like RIP-7212.
        vm.etch(PRECOMPILE, _fixture("test/fixtures/daimo-p256-verifier.hex"));

        verifier = new OlienVerifier();
        subImpl = new SubAccount();
        impl = new Olien(ENTRY_POINT, address(verifier), address(subImpl));
        factory = new OlienFactory(address(impl));
        usdc = new MockToken();
        hasher = new HashHelper();

        alice = vm.addr(alicePk);
        bob = vm.addr(bobPk);
        carol = vm.addr(carolPk);
        guardian = vm.addr(guardianPk);
        (deviceX, deviceY) = vm.publicKeyP256(devicePk);
        (passkeyX, passkeyY) = vm.publicKeyP256(passkeyPk);
        vm.warp(1_800_000_000);
    }

    function _fixture(string memory path) internal view returns (bytes memory) {
        return vm.parseBytes(vm.trim(vm.readFile(path)));
    }

    // ---------------------------------------------------------------- signers

    function ecdsa(address a, uint8 permissions) internal pure returns (SignerInput memory) {
        return SignerInput(KIND_ECDSA, permissions, 0, abi.encodePacked(a));
    }

    function p256(uint256 x, uint256 y, uint8 permissions) internal pure returns (SignerInput memory) {
        return SignerInput(KIND_P256, permissions, 0, abi.encode(x, y));
    }

    function webauthn(uint256 x, uint256 y, uint8 permissions, uint8 flags) internal pure returns (SignerInput memory) {
        return SignerInput(KIND_WEBAUTHN, permissions, flags, abi.encode(x, y));
    }

    function contractSigner(address a, uint8 permissions) internal pure returns (SignerInput memory) {
        return SignerInput(KIND_CONTRACT, permissions, 0, abi.encodePacked(a));
    }

    function idOf(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }

    function idOf(uint256 x, uint256 y) internal pure returns (bytes32) {
        return keccak256(abi.encode(x, y));
    }

    function two(SignerInput memory a, SignerInput memory b) internal pure returns (SignerInput[] memory list) {
        list = new SignerInput[](2);
        list[0] = a;
        list[1] = b;
    }

    function three(SignerInput memory a, SignerInput memory b, SignerInput memory c)
        internal
        pure
        returns (SignerInput[] memory list)
    {
        list = new SignerInput[](3);
        list[0] = a;
        list[1] = b;
        list[2] = c;
    }

    function initOf(SignerInput[] memory signers, uint16 threshold, uint48 configDelay)
        internal
        pure
        returns (Init memory)
    {
        return Init(signers, threshold, 0, configDelay, 0, 0);
    }

    function deploy(Init memory init, bytes32 salt) internal returns (Olien account) {
        account = Olien(payable(factory.createAccount(init, salt)));
        usdc.mint(address(account), 1_000e6);
        vm.deal(address(account), 10 ether);
    }

    /// @dev Alice and Bob, 2-of-2, no delay: the plain team account most tests start from.
    function plainAccount() internal returns (Olien) {
        return deploy(initOf(two(ecdsa(alice, PERM_APPROVE | PERM_VETO), ecdsa(bob, PERM_APPROVE | PERM_VETO)), 2, 0), "plain");
    }

    // ------------------------------------------------------------- signatures

    function signECDSA(uint256 pk, bytes32 hash) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, hash);
        return abi.encodePacked(r, s, v);
    }

    function signP256(uint256 pk, bytes32 hash) internal pure returns (bytes memory) {
        (bytes32 r, bytes32 s) = vm.signP256(pk, hash);
        if (uint256(s) > P256_N / 2) s = bytes32(P256_N - uint256(s));
        return abi.encodePacked(r, s);
    }

    function signWebAuthn(uint256 pk, bytes32 hash, bytes1 flags) internal pure returns (bytes memory) {
        bytes memory authenticatorData = abi.encodePacked(keccak256("recourse.app"), flags, uint32(7));
        bytes memory clientDataFields = bytes('"origin":"https://recourse.app","crossOrigin":false');
        bytes memory clientDataJSON = bytes.concat(
            '{"type":"webauthn.get","challenge":"',
            bytes(Base64.encodeURL(abi.encodePacked(hash))),
            '",',
            clientDataFields,
            "}"
        );
        bytes32 message = sha256(bytes.concat(authenticatorData, sha256(clientDataJSON)));
        (bytes32 r, bytes32 s) = vm.signP256(pk, message);
        if (uint256(s) > P256_N / 2) s = bytes32(P256_N - uint256(s));
        return abi.encode(authenticatorData, clientDataFields, uint256(r), uint256(s));
    }

    function entry(bytes32 id, bytes memory sig) internal pure returns (bytes memory) {
        return abi.encodePacked(id, uint16(sig.length), sig);
    }

    /// @dev Packs entries in ascending signer order, as the account requires.
    function pack(bytes32[] memory ids, bytes[] memory sigs) internal pure returns (bytes memory out) {
        for (uint256 i = 0; i < ids.length; i++) {
            for (uint256 j = i + 1; j < ids.length; j++) {
                if (ids[j] < ids[i]) {
                    (ids[i], ids[j]) = (ids[j], ids[i]);
                    (sigs[i], sigs[j]) = (sigs[j], sigs[i]);
                }
            }
        }
        for (uint256 i = 0; i < ids.length; i++) {
            out = bytes.concat(out, entry(ids[i], sigs[i]));
        }
    }

    function pack1(bytes32 id, bytes memory sig) internal pure returns (bytes memory) {
        return entry(id, sig);
    }

    function pack2(bytes32 idA, bytes memory a, bytes32 idB, bytes memory b) internal pure returns (bytes memory) {
        bytes32[] memory ids = new bytes32[](2);
        bytes[] memory sigs = new bytes[](2);
        (ids[0], ids[1]) = (idA, idB);
        (sigs[0], sigs[1]) = (a, b);
        return pack(ids, sigs);
    }

    /// @dev Alice and Bob over a hash, packed.
    function aliceBob(bytes32 hash) internal view returns (bytes memory) {
        return pack2(idOf(alice), signECDSA(alicePk, hash), idOf(bob), signECDSA(bobPk, hash));
    }

    // ----------------------------------------------------------- transactions

    function transferCall(address to, uint256 amount) internal view returns (Call memory) {
        return Call(address(usdc), 0, abi.encodeCall(MockToken.transfer, (to, amount)));
    }

    function selfCall(Olien account, bytes memory data) internal pure returns (Call memory) {
        return Call(address(account), 0, data);
    }

    function one(Call memory c) internal pure returns (Call[] memory list) {
        list = new Call[](1);
        list[0] = c;
    }

    function txn(Call[] memory calls) internal view returns (Transaction memory) {
        return Transaction(0, calls, 0, uint48(block.timestamp + 1 days));
    }

    function txn(Call memory c) internal view returns (Transaction memory) {
        return txn(one(c));
    }

    /// @dev Executes a batch under Alice and Bob, the way the plain account is used.
    function runAliceBob(Olien account, Call[] memory calls) internal returns (bytes32 hash) {
        Transaction memory t = txn(calls);
        hash = account.getTransactionHash(t);
        account.execute(t, aliceBob(hash));
    }

    function runAliceBob(Olien account, Call memory c) internal returns (bytes32) {
        return runAliceBob(account, one(c));
    }

    // -------------------------------------------------------------- ERC-4337

    function userOp(Olien account, Call[] memory calls, uint192 key)
        internal
        view
        returns (PackedUserOperation memory op)
    {
        op.sender = address(account);
        op.nonce = IEntryPoint(ENTRY_POINT).getNonce(address(account), key);
        op.callData = abi.encodeWithSelector(IAccountExecute.executeUserOp.selector, calls);
        op.accountGasLimits = bytes32((uint256(2_000_000) << 128) | 2_000_000);
        op.preVerificationGas = 60_000;
        op.gasFees = bytes32((uint256(1 gwei) << 128) | 2 gwei);
    }

    function opHash(Olien account, PackedUserOperation memory op, uint48 validAfter, uint48 validUntil)
        internal
        view
        returns (bytes32)
    {
        return hasher.userOp(account.domainSeparator(), op, validAfter, validUntil, account.getConfig().epoch, ENTRY_POINT);
    }

    function withSignature(PackedUserOperation memory op, uint48 validAfter, uint48 validUntil, bytes memory packed)
        internal
        pure
        returns (PackedUserOperation memory)
    {
        op.signature = abi.encodePacked(bytes6(validAfter), bytes6(validUntil), packed);
        return op;
    }

    function submit(PackedUserOperation memory op) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.prank(bundler);
        IEntryPoint(ENTRY_POINT).handleOps(ops, payable(bundler));
    }
}
