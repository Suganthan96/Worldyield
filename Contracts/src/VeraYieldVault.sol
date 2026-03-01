// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title VeraYieldVault
/// @notice Ledger of user positions.
///         Tracks deposit amount, current protocol, receipt token, and timestamp.
///         All functions are public — no owner restrictions.
///         Written to by CRE workflows and the Mini App.
///         Read by the Mini App dashboard.

contract VeraYieldVault {
    // ── Types ────────────────────────────────────────────────────────────────

    struct Position {
        uint256 amountUSDC;       // Amount deposited in USDC (6 decimals)
        string  protocol;         // e.g. "aave-arbitrum", "compound-base", "morpho-ethereum"
        string  receiptToken;     // e.g. "aUSDC", "cUSDC", "mUSDC"
        uint256 depositTimestamp; // Unix timestamp of last deposit/rebalance
        bool    active;           // Is the position currently active?
        uint256 chainId;          // Chain where the funds are deployed
    }

    // ── State ────────────────────────────────────────────────────────────────

    /// @notice wallet → Position
    mapping(address => Position) public positions;

    /// @notice All wallets that have ever deposited
    address[] public depositors;

    /// @notice wallet → has ever deposited?
    mapping(address => bool) public hasDeposited;

    // ── Events ───────────────────────────────────────────────────────────────

    event PositionRecorded(
        address indexed wallet,
        uint256 amountUSDC,
        string  protocol,
        uint256 chainId,
        uint256 timestamp
    );

    event PositionUpdated(
        address indexed wallet,
        string  oldProtocol,
        string  newProtocol,
        uint256 timestamp
    );

    event PositionClosed(address indexed wallet, uint256 timestamp);

    // ── Core ─────────────────────────────────────────────────────────────────

    /// @notice Record or overwrite a user's position after a deposit or rebalance.
    /// @param wallet         The user's wallet address.
    /// @param amountUSDC     Amount in USDC (6 decimals, e.g. 500_000_000 = $500).
    /// @param protocol       Protocol identifier string.
    /// @param receiptToken   Receipt/aToken symbol.
    /// @param chainId        Chain where the funds are deployed.
    function recordPosition(
        address wallet,
        uint256 amountUSDC,
        string calldata protocol,
        string calldata receiptToken,
        uint256 chainId
    ) public {
        string memory oldProtocol = positions[wallet].protocol;

        positions[wallet] = Position({
            amountUSDC:       amountUSDC,
            protocol:         protocol,
            receiptToken:     receiptToken,
            depositTimestamp: block.timestamp,
            active:           true,
            chainId:          chainId
        });

        if (!hasDeposited[wallet]) {
            hasDeposited[wallet] = true;
            depositors.push(wallet);
        }

        if (bytes(oldProtocol).length > 0 && keccak256(bytes(oldProtocol)) != keccak256(bytes(protocol))) {
            emit PositionUpdated(wallet, oldProtocol, protocol, block.timestamp);
        } else {
            emit PositionRecorded(wallet, amountUSDC, protocol, chainId, block.timestamp);
        }
    }

    /// @notice Mark a position as closed (after full withdrawal).
    function closePosition(address wallet) public {
        positions[wallet].active = false;
        positions[wallet].amountUSDC = 0;
        emit PositionClosed(wallet, block.timestamp);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    /// @notice Get a user's full position.
    function getPosition(address wallet) public view returns (Position memory) {
        return positions[wallet];
    }

    /// @notice Get total number of depositors.
    function totalDepositors() public view returns (uint256) {
        return depositors.length;
    }

    /// @notice Get all depositor addresses (paginated).
    function getDepositors(uint256 offset, uint256 limit)
        public
        view
        returns (address[] memory)
    {
        uint256 end = offset + limit;
        if (end > depositors.length) end = depositors.length;
        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = depositors[i];
        }
        return result;
    }
}
