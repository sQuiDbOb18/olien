// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {P256} from "@openzeppelin/contracts/utils/cryptography/P256.sol";

import {WebAuthn} from "./WebAuthn.sol";

interface IOlienVerifier {
    function verifyP256(bytes32 hash, bytes32 r, bytes32 s, bytes32 x, bytes32 y) external view returns (bool);
    function verifyWebAuthn(bytes32 challenge, bool requireUserVerification, bytes calldata signature, uint256 x, uint256 y)
        external
        view
        returns (bool);
}

/// @title OlienVerifier
/// @notice The P-256 and passkey checks, kept out of the account so the account fits the
///         code size limit. Stateless; the account holds its address as an immutable.
///
/// P-256 goes to the RIP-7212 precompile first. The precompile answers a wrong signature
/// with empty data, which is also what a chain without the precompile answers. On an
/// empty answer the precompile is asked about a known-good vector: if that succeeds the
/// precompile is there and the signature was simply wrong; only if the probe is empty too
/// does OpenZeppelin's Solidity verifier run. So on Arc the Solidity code never decides a
/// signature, and on a chain without the precompile it decides every one.
contract OlienVerifier is IOlienVerifier {
    address private constant PRECOMPILE = address(0x100);

    // RIP-7212 specification test vector: hash, r, s, x, y.
    bytes private constant PROBE = abi.encode(
        0x4cee90eb86eaa050036147a12d49004b6b9c72bd725d39d4785011fe190f0b4d,
        0xa73bd4903f0ce3b639bbbf6e8e80d16931ff4bcf5993d58468e8fb19086e8cac,
        0x36dbcd03009df8c59286b162af3bd7fcc0450c9aa81be5d10d312af6c66b1d60,
        0x4aebd3099c618202fcfe16ae7770b0c49ab5eadf74b754204a3bb6060e44eff3,
        0x7618b065f9832de4ca6ca971a7a1adc826d0f7c00181a5fb2ddf79ae00b4e10e
    );

    // secp256r1 group order, halved: the account only accepts canonical (low s) signatures.
    uint256 private constant HALF_N = 0x7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8;

    function verifyP256(bytes32 hash, bytes32 r, bytes32 s, bytes32 x, bytes32 y) external view returns (bool) {
        return _verifyP256(hash, r, s, x, y);
    }

    function _verifyP256(bytes32 hash, bytes32 r, bytes32 s, bytes32 x, bytes32 y) private view returns (bool) {
        if (uint256(s) == 0 || uint256(s) > HALF_N) return false;
        (bool ok, bytes memory answer) = PRECOMPILE.staticcall(abi.encode(hash, r, s, x, y));
        if (ok && answer.length == 32) return abi.decode(answer, (uint256)) == 1;
        (ok, answer) = PRECOMPILE.staticcall(PROBE);
        if (ok && answer.length == 32) return false;
        return P256.verifySolidity(hash, r, s, x, y);
    }

    function verifyWebAuthn(bytes32 challenge, bool requireUserVerification, bytes calldata signature, uint256 x, uint256 y)
        external
        view
        returns (bool)
    {
        (bool ok, bytes32 message, bytes32 r, bytes32 s) = WebAuthn.unpack(challenge, requireUserVerification, signature);
        if (!ok) return false;
        return _verifyP256(message, r, s, bytes32(x), bytes32(y));
    }
}
