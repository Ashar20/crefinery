// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IModelRegistry, IPureSapiens} from "./interfaces/IPureSapiens.sol";

/// @title ModelRegistry
/// @notice Decentralized registry for AI models with access control via allowlists
/// @dev Port of the Sui Move model_registry module to EVM
contract ModelRegistry is IModelRegistry, Ownable {
    struct Model {
        string modelId;
        address owner;
        string metadataHash;
        string dockerfileHash;
        uint256 createdAt;
        uint256 updatedAt;
        bool exists;
    }

    /// @notice Total number of registered models
    uint256 private _modelCount;

    /// @notice Mapping from model ID hash to Model struct
    mapping(bytes32 => Model) private _models;

    /// @notice Mapping from model ID hash to set of allowed server addresses
    mapping(bytes32 => mapping(address => bool)) private _allowlists;

    /// @notice Mapping from model ID hash to array of allowed server addresses (for enumeration)
    mapping(bytes32 => address[]) private _allowlistAddresses;

    /// @param initialOwner The address that will own the registry and can register models
    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @inheritdoc IModelRegistry
    function registerModel(
        string calldata modelId,
        address owner,
        string calldata metadataHash,
        string calldata dockerfileHash
    ) external onlyOwner {
        if (bytes(modelId).length == 0 || bytes(metadataHash).length == 0 || bytes(dockerfileHash).length == 0) {
            revert InvalidParameters();
        }
        if (owner == address(0)) {
            revert InvalidParameters();
        }

        bytes32 idHash = keccak256(bytes(modelId));

        if (_models[idHash].exists) {
            revert ModelAlreadyExists(modelId);
        }

        _models[idHash] = Model({
            modelId: modelId,
            owner: owner,
            metadataHash: metadataHash,
            dockerfileHash: dockerfileHash,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            exists: true
        });

        _modelCount++;

        emit ModelRegistered(idHash, modelId, owner, metadataHash, dockerfileHash);
    }

    /// @inheritdoc IModelRegistry
    function updateAllowlist(string calldata modelId, address[] calldata serverAddresses) external {
        bytes32 idHash = keccak256(bytes(modelId));

        if (!_models[idHash].exists) {
            revert ModelNotFound(modelId);
        }
        if (msg.sender != _models[idHash].owner) {
            revert Unauthorized();
        }

        // Clear existing allowlist
        address[] storage currentAddresses = _allowlistAddresses[idHash];
        for (uint256 i = 0; i < currentAddresses.length; i++) {
            _allowlists[idHash][currentAddresses[i]] = false;
        }
        delete _allowlistAddresses[idHash];

        // Set new allowlist
        for (uint256 i = 0; i < serverAddresses.length; i++) {
            address server = serverAddresses[i];
            if (server != address(0) && !_allowlists[idHash][server]) {
                _allowlists[idHash][server] = true;
                _allowlistAddresses[idHash].push(server);
            }
        }

        _models[idHash].updatedAt = block.timestamp;

        emit AllowlistUpdated(idHash, modelId, serverAddresses);
    }

    /// @inheritdoc IModelRegistry
    function isServerAllowed(string calldata modelId, address server) external view returns (bool) {
        bytes32 idHash = keccak256(bytes(modelId));
        if (!_models[idHash].exists) {
            return false;
        }
        return _allowlists[idHash][server];
    }

    /// @inheritdoc IModelRegistry
    function getModel(string calldata modelId) external view returns (IPureSapiens.ModelInfo memory) {
        bytes32 idHash = keccak256(bytes(modelId));
        if (!_models[idHash].exists) {
            revert ModelNotFound(modelId);
        }

        Model storage model = _models[idHash];
        return IPureSapiens.ModelInfo({
            modelId: model.modelId,
            owner: model.owner,
            metadataHash: model.metadataHash,
            dockerfileHash: model.dockerfileHash,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
            serverAllowlist: _allowlistAddresses[idHash]
        });
    }

    /// @inheritdoc IModelRegistry
    function getDockerfileHash(string calldata modelId, address requester) external view returns (string memory) {
        bytes32 idHash = keccak256(bytes(modelId));
        if (!_models[idHash].exists) {
            revert ModelNotFound(modelId);
        }

        Model storage model = _models[idHash];
        if (requester != model.owner && !_allowlists[idHash][requester]) {
            revert Unauthorized();
        }

        return model.dockerfileHash;
    }

    /// @inheritdoc IModelRegistry
    function getMetadataHash(string calldata modelId) external view returns (string memory) {
        bytes32 idHash = keccak256(bytes(modelId));
        if (!_models[idHash].exists) {
            revert ModelNotFound(modelId);
        }
        return _models[idHash].metadataHash;
    }

    /// @inheritdoc IModelRegistry
    function modelCount() external view returns (uint256) {
        return _modelCount;
    }
}
