// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Call} from "./IOlien.sol";

/// @title SubAccount
/// @notice An address that holds money for one account and does only what that account
///         tells it. Payroll, a vendor programme, a card: separate balances under one
///         signer set, with spending limits scoped to each.
///
/// Deployed as a minimal proxy (EIP-1167) of one implementation, by the parent account,
/// which sets itself as `parent` in the same transaction.
contract SubAccount {
    address public parent;

    error NotParent();
    error AlreadyInitialized();
    error CallFailed(uint256 index, bytes reason);
    error TransferFailed();

    constructor() {
        // The implementation itself belongs to nobody usable.
        parent = address(1);
    }

    function initialize(address parent_) external {
        if (parent != address(0)) revert AlreadyInitialized();
        parent = parent_;
    }

    function execute(Call[] calldata calls) external {
        if (msg.sender != parent) revert NotParent();
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok, bytes memory ret) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, ret);
        }
    }

    /// @notice An ERC-20 transfer with the return value checked, for spending limits.
    function transfer(address token, address to, uint256 amount) external {
        if (msg.sender != parent) revert NotParent();
        (bool ok, bytes memory answer) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok || (answer.length != 0 && !abi.decode(answer, (bool)))) revert TransferFailed();
    }

    receive() external payable {}

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}
