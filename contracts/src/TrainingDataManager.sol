// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TrainingDataManager
/// @notice Manages training data assignments from CRE DON evaluations
/// @dev Only the CRE DON forwarder (or owner) can assign training data
contract TrainingDataManager is Ownable {
    /// @notice Authorized CRE DON forwarder address
    address public creForwarder;

    /// @notice Mapping from model ID hash to array of assigned Walrus blob IDs
    mapping(bytes32 => string[]) private _trainingData;

    /// @notice Mapping from model ID hash to mapping of blob ID hash to bool (dedup)
    mapping(bytes32 => mapping(bytes32 => bool)) private _assignedBlobs;

    event TrainingDataAssigned(bytes32 indexed modelIdHash, string modelId, string blobId, uint256 score);
    event ForwarderUpdated(address indexed oldForwarder, address indexed newForwarder);

    error UnauthorizedForwarder();
    error EmptyModelId();
    error EmptyBlobId();
    error BlobAlreadyAssigned(string modelId, string blobId);

    modifier onlyForwarder() {
        if (msg.sender != creForwarder && msg.sender != owner()) revert UnauthorizedForwarder();
        _;
    }

    /// @param _owner The address that will own the contract
    /// @param _creForwarder The CRE DON forwarder address authorized to assign training data
    constructor(address _owner, address _creForwarder) Ownable(_owner) {
        creForwarder = _creForwarder;
    }

    /// @notice Assign a training session blob to a model
    /// @param modelId The model identifier
    /// @param blobId The Walrus blob ID containing the encrypted session
    /// @param score The relevance score (0-100) from CRE evaluation
    function assignTrainingData(
        string calldata modelId,
        string calldata blobId,
        uint256 score
    ) external onlyForwarder {
        if (bytes(modelId).length == 0) revert EmptyModelId();
        if (bytes(blobId).length == 0) revert EmptyBlobId();

        bytes32 modelIdHash = keccak256(bytes(modelId));
        bytes32 blobIdHash = keccak256(bytes(blobId));

        if (_assignedBlobs[modelIdHash][blobIdHash]) {
            revert BlobAlreadyAssigned(modelId, blobId);
        }

        _assignedBlobs[modelIdHash][blobIdHash] = true;
        _trainingData[modelIdHash].push(blobId);

        emit TrainingDataAssigned(modelIdHash, modelId, blobId, score);
    }

    /// @notice Get all training data blob IDs for a model
    /// @param modelId The model identifier
    /// @return Array of Walrus blob IDs assigned to this model
    function getTrainingData(string calldata modelId) external view returns (string[] memory) {
        return _trainingData[keccak256(bytes(modelId))];
    }

    /// @notice Get the number of training data blobs for a model
    /// @param modelId The model identifier
    /// @return Number of assigned blobs
    function getTrainingDataCount(string calldata modelId) external view returns (uint256) {
        return _trainingData[keccak256(bytes(modelId))].length;
    }

    /// @notice Check if a blob is already assigned to a model
    /// @param modelId The model identifier
    /// @param blobId The Walrus blob ID
    /// @return Whether the blob is assigned
    function isBlobAssigned(string calldata modelId, string calldata blobId) external view returns (bool) {
        return _assignedBlobs[keccak256(bytes(modelId))][keccak256(bytes(blobId))];
    }

    /// @notice Update the CRE DON forwarder address
    /// @param _forwarder The new forwarder address
    function setForwarder(address _forwarder) external onlyOwner {
        address old = creForwarder;
        creForwarder = _forwarder;
        emit ForwarderUpdated(old, _forwarder);
    }
}
