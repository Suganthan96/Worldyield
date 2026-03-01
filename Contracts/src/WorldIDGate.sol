// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title WorldIDGate
/// @notice Verifies World ID ZK proofs (V3 legacy / orbLegacy).
///         Stores used nullifiers to prevent replay.
///         All functions are public — no owner restrictions.

interface IWorldID {
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}

contract WorldIDGate {
    // ── State ────────────────────────────────────────────────────────────────

    IWorldID public worldIdRouter;

    /// @notice groupId = 1 for Orb-verified humans (legacy V3)
    uint256 public constant GROUP_ID = 1;

    /// @notice nullifierHash → has it been used?
    mapping(uint256 => bool) public nullifierUsed;

    /// @notice address → is this wallet verified as human?
    mapping(address => bool) public isVerifiedHuman;

    /// @notice address → nullifier that verified them (for auditing)
    mapping(address => uint256) public addressNullifier;

    // ── Events ───────────────────────────────────────────────────────────────

    event HumanVerified(address indexed wallet, uint256 indexed nullifierHash);
    event RouterUpdated(address indexed newRouter);

    // ── Errors ───────────────────────────────────────────────────────────────

    error NullifierAlreadyUsed();
    error ProofVerificationFailed();

    // ── Constructor ──────────────────────────────────────────────────────────

    /// @param _worldIdRouter  WorldIDRouter address on World Chain Sepolia:
    ///                        0x57f928150405879D4BeA37DdeBa8e95b34DEDf7f
    constructor(address _worldIdRouter) {
        worldIdRouter = IWorldID(_worldIdRouter);
    }

    // ── Core ─────────────────────────────────────────────────────────────────

    /// @notice Verify a World ID ZK proof and mark the wallet as a verified human.
    /// @param wallet               The wallet address being verified (used as signal).
    /// @param root                 Merkle root from the IDKit response.
    /// @param nullifierHash        Nullifier hash from the IDKit response.
    /// @param externalNullifierHash  Hash of (appId, action).
    /// @param proof                8-element ZK proof array from IDKit response.
    function verifyHuman(
        address wallet,
        uint256 root,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) public {
        if (nullifierUsed[nullifierHash]) revert NullifierAlreadyUsed();

        // Signal is the wallet address — binds proof to this specific wallet
        uint256 signalHash = uint256(keccak256(abi.encodePacked(wallet))) >> 8;

        worldIdRouter.verifyProof(
            root,
            GROUP_ID,
            signalHash,
            nullifierHash,
            externalNullifierHash,
            proof
        );

        nullifierUsed[nullifierHash] = true;
        isVerifiedHuman[wallet] = true;
        addressNullifier[wallet] = nullifierHash;

        emit HumanVerified(wallet, nullifierHash);
    }

    /// @notice Check if an address is a verified human.
    function checkHuman(address wallet) public view returns (bool) {
        return isVerifiedHuman[wallet];
    }

    /// @notice Update the WorldIDRouter address (useful if router is upgraded).
    function updateRouter(address _newRouter) public {
        worldIdRouter = IWorldID(_newRouter);
        emit RouterUpdated(_newRouter);
    }
}
