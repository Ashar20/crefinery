// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IFinetuneProofRegistry, IPureSapiens} from "./interfaces/IPureSapiens.sol";

/// @title FinetuneProofRegistry
/// @notice Stores and verifies fine-tuning proofs for AI models
/// @dev Port of the Sui Move finetune_registry module to EVM
contract FinetuneProofRegistry is IFinetuneProofRegistry {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    struct FinetuneProof {
        string modelId;
        uint256 timestampMs;
        bytes32[] sessionHashes;
        bytes signature;
        uint256 createdAt;
        bool exists;
    }

    /// @notice Maximum allowed time window between proof timestamp and block timestamp (24 hours in ms)
    uint256 public constant MAX_TIMESTAMP_WINDOW = 24 hours * 1000;

    /// @notice Auto-incrementing proof ID counter
    uint256 private _nextProofId;

    /// @notice Mapping from proof ID to FinetuneProof
    mapping(uint256 => FinetuneProof) private _proofs;

    /// @notice Mapping from model ID hash to array of proof IDs
    mapping(bytes32 => uint256[]) private _modelProofs;

    /// @inheritdoc IFinetuneProofRegistry
    function storeProof(
        string calldata modelId,
        uint256 timestampMs,
        bytes32[] calldata sessionHashes,
        bytes calldata signature
    ) external returns (uint256 proofId) {
        if (bytes(modelId).length == 0) {
            revert EmptyModelId();
        }
        if (sessionHashes.length == 0) {
            revert EmptySessionHashes();
        }

        // Verify timestamp is within the acceptable window
        uint256 currentTimestampMs = block.timestamp * 1000;
        if (
            timestampMs > currentTimestampMs + MAX_TIMESTAMP_WINDOW
                || (currentTimestampMs > MAX_TIMESTAMP_WINDOW && timestampMs < currentTimestampMs - MAX_TIMESTAMP_WINDOW)
        ) {
            revert TimestampOutOfWindow(timestampMs, currentTimestampMs);
        }

        // Verify signature is not empty
        if (signature.length == 0) {
            revert InvalidSignature();
        }

        // Construct the message hash that was signed
        bytes32 messageHash = keccak256(abi.encodePacked(modelId, timestampMs, sessionHashes));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();

        // Verify the signature recovers to a valid address
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(ethSignedHash, signature);
        if (err != ECDSA.RecoverError.NoError || recovered == address(0)) {
            revert InvalidSignature();
        }

        proofId = _nextProofId++;

        _proofs[proofId] = FinetuneProof({
            modelId: modelId,
            timestampMs: timestampMs,
            sessionHashes: sessionHashes,
            signature: signature,
            createdAt: block.timestamp,
            exists: true
        });

        bytes32 modelIdHash = keccak256(bytes(modelId));
        _modelProofs[modelIdHash].push(proofId);

        emit ProofStored(proofId, modelIdHash, modelId, timestampMs);
    }

    /// @inheritdoc IFinetuneProofRegistry
    function getProof(uint256 proofId) external view returns (IPureSapiens.FinetuneProofInfo memory) {
        if (!_proofs[proofId].exists) {
            revert ProofNotFound(proofId);
        }

        FinetuneProof storage proof = _proofs[proofId];
        return IPureSapiens.FinetuneProofInfo({
            modelId: proof.modelId,
            timestampMs: proof.timestampMs,
            sessionHashes: proof.sessionHashes,
            signature: proof.signature,
            createdAt: proof.createdAt
        });
    }

    /// @inheritdoc IFinetuneProofRegistry
    function getProofsByModel(string calldata modelId) external view returns (uint256[] memory) {
        bytes32 modelIdHash = keccak256(bytes(modelId));
        return _modelProofs[modelIdHash];
    }

    /// @inheritdoc IFinetuneProofRegistry
    function verifyProofSignature(uint256 proofId, address signer) external view returns (bool) {
        if (!_proofs[proofId].exists) {
            revert ProofNotFound(proofId);
        }

        FinetuneProof storage proof = _proofs[proofId];

        bytes32 messageHash = keccak256(abi.encodePacked(proof.modelId, proof.timestampMs, proof.sessionHashes));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(ethSignedHash, proof.signature);
        if (err != ECDSA.RecoverError.NoError) {
            return false;
        }

        return recovered == signer;
    }
}
