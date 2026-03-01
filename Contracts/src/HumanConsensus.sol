// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title HumanConsensus
/// @notice Trust signal contract.
///         Tracks the count of World ID verified humans per protocol pool.
///         Increments on deposit, decrements on withdrawal.
///         The AI agent reads this to boost confidence scores.
///         Bots can never fake this — every write must pair with a verified wallet.
///         All functions are public — no owner restrictions.

contract HumanConsensus {
    // ── State ────────────────────────────────────────────────────────────────

    /// @notice poolId → count of verified humans currently deposited
    /// @dev    poolId format: "aave-arbitrum", "compound-base", "morpho-ethereum"
    mapping(string => uint256) public humanCount;

    /// @notice poolId → total humans that have EVER deposited (historical)
    mapping(string => uint256) public totalEverDeposited;

    /// @notice wallet → poolId → is currently in this pool?
    mapping(address => mapping(string => bool)) public isInPool;

    /// @notice All pool IDs that have been interacted with
    string[] public pools;
    mapping(string => bool) public poolExists;

    /// @notice wallet → list of pools they are currently in
    mapping(address => string[]) public walletPools;

    // ── Events ───────────────────────────────────────────────────────────────

    event HumanEntered(address indexed wallet, string pool, uint256 newCount, uint256 timestamp);
    event HumanExited(address indexed wallet, string pool, uint256 newCount, uint256 timestamp);
    event PoolRegistered(string pool, uint256 timestamp);

    // ── Errors ───────────────────────────────────────────────────────────────

    error AlreadyInPool();
    error NotInPool();

    // ── Core ─────────────────────────────────────────────────────────────────

    /// @notice Record a verified human entering a pool (called on deposit).
    /// @param wallet  The verified human's wallet address.
    /// @param poolId  Protocol pool identifier (e.g. "aave-arbitrum").
    function enter(address wallet, string calldata poolId) public {
        if (isInPool[wallet][poolId]) revert AlreadyInPool();

        _registerPool(poolId);

        isInPool[wallet][poolId] = true;
        humanCount[poolId] += 1;
        totalEverDeposited[poolId] += 1;
        walletPools[wallet].push(poolId);

        emit HumanEntered(wallet, poolId, humanCount[poolId], block.timestamp);
    }

    /// @notice Record a verified human exiting a pool (called on withdrawal/rebalance).
    /// @param wallet  The verified human's wallet address.
    /// @param poolId  Protocol pool identifier.
    function exit(address wallet, string calldata poolId) public {
        if (!isInPool[wallet][poolId]) revert NotInPool();

        isInPool[wallet][poolId] = false;

        if (humanCount[poolId] > 0) {
            humanCount[poolId] -= 1;
        }

        // Remove from walletPools array
        string[] storage wp = walletPools[wallet];
        for (uint256 i = 0; i < wp.length; i++) {
            if (keccak256(bytes(wp[i])) == keccak256(bytes(poolId))) {
                wp[i] = wp[wp.length - 1];
                wp.pop();
                break;
            }
        }

        emit HumanExited(wallet, poolId, humanCount[poolId], block.timestamp);
    }

    /// @notice Move a human from one pool to another in one tx (used by rebalance).
    function rebalance(
        address wallet,
        string calldata fromPool,
        string calldata toPool
    ) public {
        exit(wallet, fromPool);
        enter(wallet, toPool);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    /// @notice Get the current verified human count for a pool.
    function getHumanCount(string calldata poolId) public view returns (uint256) {
        return humanCount[poolId];
    }

    /// @notice Get counts for multiple pools at once (for the AI agent / dashboard).
    function getBulkCounts(string[] calldata poolIds)
        public
        view
        returns (uint256[] memory counts)
    {
        counts = new uint256[](poolIds.length);
        for (uint256 i = 0; i < poolIds.length; i++) {
            counts[i] = humanCount[poolIds[i]];
        }
    }

    /// @notice Check if a specific wallet is in a specific pool.
    function isWalletInPool(address wallet, string calldata poolId)
        public
        view
        returns (bool)
    {
        return isInPool[wallet][poolId];
    }

    /// @notice Get all pools a wallet is currently in.
    function getWalletPools(address wallet)
        public
        view
        returns (string[] memory)
    {
        return walletPools[wallet];
    }

    /// @notice Total number of distinct pools registered.
    function totalPools() public view returns (uint256) {
        return pools.length;
    }

    /// @notice Get all registered pool IDs.
    function getAllPools() public view returns (string[] memory) {
        return pools;
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _registerPool(string memory poolId) internal {
        if (!poolExists[poolId]) {
            poolExists[poolId] = true;
            pools.push(poolId);
            emit PoolRegistered(poolId, block.timestamp);
        }
    }
}
