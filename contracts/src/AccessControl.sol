// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IAccessControl} from "./interfaces/IPureSapiens.sol";

/// @title AccessControl
/// @notice Manages encryption access control policies for the PureSapiens protocol
/// @dev Port of the Sui Move allowlist (SEAL policy) module to EVM
contract AccessControl is IAccessControl {
    struct Policy {
        address creator;
        bool exists;
    }

    /// @notice Counter for generating unique policy IDs
    uint256 private _policyNonce;

    /// @notice Mapping from policy ID to Policy metadata
    mapping(bytes32 => Policy) private _policies;

    /// @notice Mapping from policy ID to (address => access granted)
    mapping(bytes32 => mapping(address => bool)) private _access;

    /// @notice Mapping from policy ID to list of addresses with access (for enumeration)
    mapping(bytes32 => address[]) private _accessList;

    /// @inheritdoc IAccessControl
    function createPolicy(address[] calldata initialAddresses) external returns (bytes32 policyId) {
        policyId = keccak256(abi.encodePacked(msg.sender, _policyNonce, block.timestamp, block.chainid));
        _policyNonce++;

        if (_policies[policyId].exists) {
            revert PolicyAlreadyExists(policyId);
        }

        _policies[policyId] = Policy({creator: msg.sender, exists: true});

        for (uint256 i = 0; i < initialAddresses.length; i++) {
            address account = initialAddresses[i];
            if (account != address(0) && !_access[policyId][account]) {
                _access[policyId][account] = true;
                _accessList[policyId].push(account);
                emit AccessGranted(policyId, account);
            }
        }

        emit PolicyCreated(policyId, msg.sender);
    }

    /// @inheritdoc IAccessControl
    function grantAccess(bytes32 policyId, address account) external {
        if (!_policies[policyId].exists) {
            revert PolicyNotFound(policyId);
        }
        if (msg.sender != _policies[policyId].creator) {
            revert NotPolicyCreator(policyId);
        }
        if (_access[policyId][account]) {
            revert AccessAlreadyGranted(policyId, account);
        }

        _access[policyId][account] = true;
        _accessList[policyId].push(account);

        emit AccessGranted(policyId, account);
    }

    /// @inheritdoc IAccessControl
    function revokeAccess(bytes32 policyId, address account) external {
        if (!_policies[policyId].exists) {
            revert PolicyNotFound(policyId);
        }
        if (msg.sender != _policies[policyId].creator) {
            revert NotPolicyCreator(policyId);
        }
        if (!_access[policyId][account]) {
            revert AccessNotGranted(policyId, account);
        }

        _access[policyId][account] = false;

        // Remove from access list by swapping with last element
        address[] storage list = _accessList[policyId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == account) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }

        emit AccessRevoked(policyId, account);
    }

    /// @inheritdoc IAccessControl
    function hasAccess(bytes32 policyId, address account) external view returns (bool) {
        if (!_policies[policyId].exists) {
            return false;
        }
        return _access[policyId][account];
    }

    /// @inheritdoc IAccessControl
    function getPolicyCreator(bytes32 policyId) external view returns (address) {
        if (!_policies[policyId].exists) {
            revert PolicyNotFound(policyId);
        }
        return _policies[policyId].creator;
    }

    /// @notice Returns all addresses with access to a policy
    /// @param policyId The policy to query
    /// @return The list of addresses with access
    function getAccessList(bytes32 policyId) external view returns (address[] memory) {
        if (!_policies[policyId].exists) {
            revert PolicyNotFound(policyId);
        }
        return _accessList[policyId];
    }
}
