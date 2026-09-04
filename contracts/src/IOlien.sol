// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev One call in a batch. Never a delegatecall.
struct Call {
    address to;
    uint256 value;
    bytes data;
}

/// @dev What `execute` takes. The sequence number and the epoch come from storage.
struct Transaction {
    uint192 nonceKey;
    Call[] calls;
    uint48 validAfter;
    uint48 validUntil;
}

/// @dev How a signer is described when added. `key` is 20 bytes for ECDSA and
///      CONTRACT signers, 64 bytes (x ‖ y) for P256 and WEBAUTHN signers.
struct SignerInput {
    uint8 kind;
    uint8 permissions;
    uint8 flags;
    bytes key;
}

struct SignerView {
    uint8 kind;
    uint8 permissions;
    uint8 flags;
    uint64 since;
    uint256 x;
    uint256 y;
}

struct ConfigView {
    uint16 threshold;
    uint16 vetoThreshold;
    uint16 effectiveVetoThreshold;
    uint16 signerCount;
    uint16 approverCount;
    uint16 vetoerCount;
    uint16 approverVetoerCount;
    uint16 recovererCount;
    uint48 configDelay;
    uint48 recoveryDelay;
    uint48 recoveryCoSignDelay;
    uint64 epoch;
    uint256 limitCount;
    bool implementationFrozen;
}

struct Init {
    SignerInput[] signers;
    uint16 threshold;
    uint16 vetoThreshold;
    uint48 configDelay;
    uint48 recoveryDelay;
    uint48 recoveryCoSignDelay;
}

/// @dev `subAccount` is 0 for the account itself, otherwise the sub-account index plus one.
///      Signers and destinations are added afterwards with `allowLimitSigner` and
///      `allowLimitDestination`; a limit with no destination allowed pays anyone.
struct SpendingLimitInput {
    address token;
    uint256 subAccount;
    uint128 amount;
    uint48 period;
    bool anyDestination;
}

struct ScheduledView {
    uint48 readyAt;
    uint64 epoch;
    uint8 path;
    bytes32 excluded;
    bytes32 callsHash;
}

uint8 constant KIND_NONE = 0;
uint8 constant KIND_ECDSA = 1;
uint8 constant KIND_P256 = 2;
uint8 constant KIND_WEBAUTHN = 3;
uint8 constant KIND_CONTRACT = 4;

uint8 constant PERM_APPROVE = 1;
uint8 constant PERM_VETO = 2;
uint8 constant PERM_RECOVER = 4;

uint8 constant FLAG_UV_REQUIRED = 1;

uint8 constant PATH_THRESHOLD = 1;
uint8 constant PATH_RECOVERY = 2;
uint8 constant PATH_SINGLE = 3;

interface IOlien {
    event Initialized(
        uint16 threshold, uint16 vetoThreshold, uint48 configDelay, uint48 recoveryDelay, uint48 recoveryCoSignDelay
    );
    event SignerAdded(bytes32 indexed id, uint8 kind, uint8 permissions, uint8 flags, uint256 x, uint256 y);
    event SignerRemoved(bytes32 indexed id);
    event ThresholdChanged(uint16 threshold);
    event VetoThresholdChanged(uint16 vetoThreshold);
    event DelaysChanged(uint48 configDelay, uint48 recoveryDelay, uint48 recoveryCoSignDelay);
    event EpochAdvanced(uint64 epoch);
    event Executed(bytes32 indexed hash, uint256 nonce, uint8 path);
    event Scheduled(bytes32 indexed hash, uint48 readyAt, uint8 path, bytes32 excluded);
    event ScheduledExecuted(bytes32 indexed hash);
    event Approved(bytes32 indexed hash, bytes32 indexed signerId);
    event Vetoed(bytes32 indexed hash, bytes32 indexed signerId, uint16 count);
    event Cancelled(bytes32 indexed hash);
    event SpendingLimitSet(
        uint256 indexed id, uint32 generation, address token, address from, uint128 amount, uint48 period, bool anyDestination
    );
    event LimitSignerAllowed(uint256 indexed id, uint32 generation, bytes32 indexed signerId);
    event LimitDestinationAllowed(uint256 indexed id, uint32 generation, address indexed to);
    event SpendingLimitRemoved(uint256 indexed id);
    event Spent(uint256 indexed id, bytes32 indexed signerId, address to, uint256 amount);
    event ImplementationChanged(address implementation);
    event ImplementationFrozen();
    event SubAccountCreated(uint256 indexed index, address subAccount);

    error NotEntryPoint();
    error NotSelf();
    error Unauthorized();
    error InvalidSignatures();
    error MalformedSignatures();
    error BadCallData();
    error AlreadyInitialized();
    error UnknownSigner(bytes32 id);
    error SignerExists(bytes32 id);
    error BadKey();
    error BadPermissions();
    error BadConfig();
    error NotYetValid();
    error Expired();
    error Dead(bytes32 hash);
    error AlreadyScheduled(bytes32 hash);
    error NothingScheduled(bytes32 hash);
    error NotReady(bytes32 hash);
    error WindowClosed(bytes32 hash);
    error Stale(bytes32 hash);
    error CallsMismatch(bytes32 hash);
    error SelfCallRefused(bytes4 selector);
    error AlreadyVetoed(bytes32 hash, bytes32 signerId);
    error LimitMissing(uint256 id);
    error LimitDestination(address to);
    error LimitExceeded(uint256 id, uint256 amount, uint256 remaining);
    error Frozen();
    error NotAnImplementation(address implementation);
    error TransferFailed();
    error NotValidated();
    error Reentered();
}
