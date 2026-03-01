// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IPureSapiens - Common interfaces and structs for the PureSapiens protocol
/// @notice Shared types used across PureSapiens contracts
interface IPureSapiens {
    /// @notice Represents a registered AI model
    struct ModelInfo {
        string modelId;
        address owner;
        string metadataHash;
        string dockerfileHash;
        uint256 createdAt;
        uint256 updatedAt;
        address[] serverAllowlist;
    }

    /// @notice Represents a fine-tuning proof
    struct FinetuneProofInfo {
        string modelId;
        uint256 timestampMs;
        bytes32[] sessionHashes;
        bytes signature;
        uint256 createdAt;
    }
}

/// @title IModelRegistry - Interface for the Model Registry contract
interface IModelRegistry {
    event ModelRegistered(
        bytes32 indexed modelIdHash, string modelId, address indexed owner, string metadataHash, string dockerfileHash
    );
    event AllowlistUpdated(bytes32 indexed modelIdHash, string modelId, address[] serverAddresses);

    error ModelAlreadyExists(string modelId);
    error ModelNotFound(string modelId);
    error Unauthorized();
    error InvalidParameters();

    function registerModel(string calldata modelId, address owner, string calldata metadataHash, string calldata dockerfileHash) external;
    function updateAllowlist(string calldata modelId, address[] calldata serverAddresses) external;
    function isServerAllowed(string calldata modelId, address server) external view returns (bool);
    function getModel(string calldata modelId) external view returns (IPureSapiens.ModelInfo memory);
    function getDockerfileHash(string calldata modelId, address requester) external view returns (string memory);
    function getMetadataHash(string calldata modelId) external view returns (string memory);
    function modelCount() external view returns (uint256);
}

/// @title IAccessControl - Interface for the Access Control contract
interface IAccessControl {
    event PolicyCreated(bytes32 indexed policyId, address indexed creator);
    event AccessGranted(bytes32 indexed policyId, address indexed account);
    event AccessRevoked(bytes32 indexed policyId, address indexed account);

    error PolicyNotFound(bytes32 policyId);
    error PolicyAlreadyExists(bytes32 policyId);
    error NotPolicyCreator(bytes32 policyId);
    error AccessAlreadyGranted(bytes32 policyId, address account);
    error AccessNotGranted(bytes32 policyId, address account);

    function createPolicy(address[] calldata initialAddresses) external returns (bytes32 policyId);
    function grantAccess(bytes32 policyId, address account) external;
    function revokeAccess(bytes32 policyId, address account) external;
    function hasAccess(bytes32 policyId, address account) external view returns (bool);
    function getPolicyCreator(bytes32 policyId) external view returns (address);
}

/// @title IFinetuneProofRegistry - Interface for the Finetune Proof Registry contract
interface IFinetuneProofRegistry {
    event ProofStored(uint256 indexed proofId, bytes32 indexed modelIdHash, string modelId, uint256 timestampMs);

    error ProofNotFound(uint256 proofId);
    error TimestampOutOfWindow(uint256 timestampMs, uint256 currentTimestampMs);
    error InvalidSignature();
    error EmptySessionHashes();
    error EmptyModelId();

    function storeProof(string calldata modelId, uint256 timestampMs, bytes32[] calldata sessionHashes, bytes calldata signature) external returns (uint256 proofId);
    function getProof(uint256 proofId) external view returns (IPureSapiens.FinetuneProofInfo memory);
    function getProofsByModel(string calldata modelId) external view returns (uint256[] memory);
    function verifyProofSignature(uint256 proofId, address signer) external view returns (bool);
}
