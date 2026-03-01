// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MandateStorage
/// @notice Stores per-user rebalance mandates.
///         CRE cron workflow reads this every 24 hours and triggers rebalance
///         if the current APY drops below the user's threshold.
///         All functions are public — no owner restrictions.

contract MandateStorage {
    // ── Types ────────────────────────────────────────────────────────────────

    struct Mandate {
        uint256 minApyBps;        // Minimum APY in basis points (e.g. 1500 = 15.00%)
        bool    active;           // Is this mandate currently active?
        uint256 createdAt;        // When was it set?
        uint256 lastCheckedAt;    // When did CRE last evaluate it?
        string  preferredChains;  // Comma-separated preferred chains, e.g. "arbitrum,base"
        string  excludeProtocols; // Comma-separated protocols to avoid, e.g. "compound-base"
    }

    // ── State ────────────────────────────────────────────────────────────────

    /// @notice wallet → Mandate
    mapping(address => Mandate) public mandates;

    /// @notice All wallets that have an active mandate
    address[] public mandateHolders;

    mapping(address => bool) public hasMandateEntry;

    // ── Events ───────────────────────────────────────────────────────────────

    event MandateSet(
        address indexed wallet,
        uint256 minApyBps,
        uint256 timestamp
    );

    event MandateDeactivated(address indexed wallet, uint256 timestamp);

    event MandateChecked(
        address indexed wallet,
        uint256 currentApyBps,
        bool    rebalanceTriggered,
        uint256 timestamp
    );

    // ── Core ─────────────────────────────────────────────────────────────────

    /// @notice Set or update a rebalance mandate for a wallet.
    /// @param wallet            The user's wallet address.
    /// @param minApyBps         Minimum acceptable APY in basis points (e.g. 1500 = 15%).
    /// @param preferredChains   Comma-separated preferred chains (optional, pass "" for any).
    /// @param excludeProtocols  Comma-separated protocols to exclude (optional, pass "" for none).
    function setMandate(
        address wallet,
        uint256 minApyBps,
        string calldata preferredChains,
        string calldata excludeProtocols
    ) public {
        mandates[wallet] = Mandate({
            minApyBps:        minApyBps,
            active:           true,
            createdAt:        block.timestamp,
            lastCheckedAt:    0,
            preferredChains:  preferredChains,
            excludeProtocols: excludeProtocols
        });

        if (!hasMandateEntry[wallet]) {
            hasMandateEntry[wallet] = true;
            mandateHolders.push(wallet);
        }

        emit MandateSet(wallet, minApyBps, block.timestamp);
    }

    /// @notice Deactivate a mandate (user opts out of auto-rebalance).
    function deactivateMandate(address wallet) public {
        mandates[wallet].active = false;
        emit MandateDeactivated(wallet, block.timestamp);
    }

    /// @notice CRE cron calls this after checking a user's current APY.
    ///         Records the check and whether a rebalance was triggered.
    function recordMandateCheck(
        address wallet,
        uint256 currentApyBps,
        bool    rebalanceTriggered
    ) public {
        mandates[wallet].lastCheckedAt = block.timestamp;
        emit MandateChecked(wallet, currentApyBps, rebalanceTriggered, block.timestamp);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    /// @notice Get a user's mandate.
    function getMandate(address wallet) public view returns (Mandate memory) {
        return mandates[wallet];
    }

    /// @notice Check if a wallet's mandate is active and its threshold.
    function getMandateThreshold(address wallet)
        public
        view
        returns (bool active, uint256 minApyBps)
    {
        Mandate memory m = mandates[wallet];
        return (m.active, m.minApyBps);
    }

    /// @notice Total number of mandate holders.
    function totalMandates() public view returns (uint256) {
        return mandateHolders.length;
    }

    /// @notice Get all mandate holder addresses (paginated).
    function getMandateHolders(uint256 offset, uint256 limit)
        public
        view
        returns (address[] memory)
    {
        uint256 end = offset + limit;
        if (end > mandateHolders.length) end = mandateHolders.length;
        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = mandateHolders[i];
        }
        return result;
    }
}
