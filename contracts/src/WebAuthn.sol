// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @title WebAuthn
/// @notice Checks a passkey assertion over a 32-byte challenge.
///
/// The browser serialises client data as `{"type":"webauthn.get","challenge":"…",` followed by
/// the origin and the rest, in that order, with no whitespace. The signature carries only
/// what follows the challenge, and the JSON is rebuilt here, so the type and the challenge
/// the authenticator signed are exactly the ones this contract checked; a second
/// "challenge" key later in the document cannot override them.
library WebAuthn {
    bytes1 private constant FLAG_USER_PRESENT = 0x01;
    bytes1 private constant FLAG_USER_VERIFIED = 0x04;

    /// @param signature `abi.encode(bytes authenticatorData, bytes clientDataFields, uint256 r, uint256 s)`,
    ///        where `clientDataFields` is the client data JSON after the challenge field,
    ///        without the leading comma.
    ///
    /// The origin, the rpIdHash and the counter are left unchecked on purpose: the relying
    /// party bound the key to its origin at registration, the platform enforces it at every
    /// assertion, and a public verifier cannot know which origin is right. Coinbase Smart
    /// Wallet and Safe's passkey signer make the same choice.
    /// @return ok whether the envelope is acceptable
    /// @return message what the authenticator signed, to hand to the P-256 check
    /// @return r the signature's r
    /// @return s the signature's s
    function unpack(bytes32 challenge, bool requireUserVerification, bytes calldata signature)
        internal
        pure
        returns (bool ok, bytes32 message, bytes32 r, bytes32 s)
    {
        (bytes memory authenticatorData, bytes memory clientDataFields, uint256 rv, uint256 sv) =
            abi.decode(signature, (bytes, bytes, uint256, uint256));
        (ok, message) = _message(challenge, requireUserVerification, authenticatorData, clientDataFields);
        return (ok, message, bytes32(rv), bytes32(sv));
    }

    function _message(
        bytes32 challenge,
        bool requireUserVerification,
        bytes memory authenticatorData,
        bytes memory clientDataFields
    ) private pure returns (bool, bytes32) {
        // rpIdHash (32) + flags (1) + counter (4) is the minimum an authenticator produces.
        if (authenticatorData.length < 37) return (false, 0);
        bytes1 flags = authenticatorData[32];
        if (flags & FLAG_USER_PRESENT == 0) return (false, 0);
        if (requireUserVerification && flags & FLAG_USER_VERIFIED == 0) return (false, 0);

        bytes memory clientDataJSON = bytes.concat(
            '{"type":"webauthn.get","challenge":"',
            bytes(Base64.encodeURL(abi.encodePacked(challenge))),
            '",',
            clientDataFields,
            "}"
        );
        return (true, sha256(bytes.concat(authenticatorData, sha256(clientDataJSON))));
    }
}
