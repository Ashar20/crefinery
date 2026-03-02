// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FinetuneProofRegistry} from "../src/FinetuneProofRegistry.sol";
import {IFinetuneProofRegistry, IPureSapiens} from "../src/interfaces/IPureSapiens.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract FinetuneProofRegistryTest is Test {
    using MessageHashUtils for bytes32;

    FinetuneProofRegistry public registry;

    uint256 internal signerPrivateKey = 0xA11CE;
    address internal signer;

    function setUp() public {
        registry = new FinetuneProofRegistry();
        signer = vm.addr(signerPrivateKey);
        // Set block timestamp to something reasonable
        vm.warp(1700000000);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _createSignature(
        string memory modelId,
        uint256 timestampMs,
        bytes32[] memory sessionHashes
    ) internal view returns (bytes memory) {
        bytes32 messageHash = keccak256(abi.encodePacked(modelId, timestampMs, sessionHashes));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    function _defaultSessionHashes() internal pure returns (bytes32[] memory) {
        bytes32[] memory hashes = new bytes32[](2);
        hashes[0] = keccak256("session-1");
        hashes[1] = keccak256("session-2");
        return hashes;
    }

    // -------------------------------------------------------------------------
    // Store proof tests
    // -------------------------------------------------------------------------

    function test_storeProof() public {
        uint256 timestampMs = block.timestamp * 1000;
        bytes32[] memory sessionHashes = _defaultSessionHashes();
        bytes memory signature = _createSignature("model-001", timestampMs, sessionHashes);

        uint256 proofId = registry.storeProof("model-001", timestampMs, sessionHashes, signature);
        assertEq(proofId, 0);

        IPureSapiens.FinetuneProofInfo memory proof = registry.getProof(proofId);
        assertEq(proof.modelId, "model-001");
        assertEq(proof.timestampMs, timestampMs);
        assertEq(proof.sessionHashes.length, 2);
        assertEq(proof.sessionHashes[0], sessionHashes[0]);
        assertEq(proof.sessionHashes[1], sessionHashes[1]);
        assertEq(proof.createdAt, block.timestamp);
    }

    function test_storeProof_emitsEvent() public {
        uint256 timestampMs = block.timestamp * 1000;
        bytes32[] memory sessionHashes = _defaultSessionHashes();
        bytes memory signature = _createSignature("model-001", timestampMs, sessionHashes);

        bytes32 expectedModelHash = keccak256(bytes("model-001"));

        vm.expectEmit(true, true, false, true);
        emit IFinetuneProofRegistry.ProofStored(0, expectedModelHash, "model-001", timestampMs);

        registry.storeProof("model-001", timestampMs, sessionHashes, signature);
    }

    function test_storeProof_incrementsId() public {
        uint256 timestampMs = block.timestamp * 1000;
        bytes32[] memory sessionHashes = _defaultSessionHashes();
        bytes memory sig1 = _createSignature("model-001", timestampMs, sessionHashes);
        bytes memory sig2 = _createSignature("model-002", timestampMs, sessionHashes);

        uint256 id1 = registry.storeProof("model-001", timestampMs, sessionHashes, sig1);
        uint256 id2 = registry.storeProof("model-002", timestampMs, sessionHashes, sig2);

        assertEq(id1, 0);
        assertEq(id2, 1);
    }

    function test_storeProof_revertsEmptyModelId() public {
        uint256 timestampMs = block.timestamp * 1000;
        bytes32[] memory sessionHashes = _defaultSessionHashes();
        bytes memory signature = _createSignature("", timestampMs, sessionHashes);

        vm.expectRevert(IFinetuneProofRegistry.EmptyModelId.selector);
        registry.storeProof("", timestampMs, sessionHashes, signature);
    }

    function test_storeProof_revertsEmptySessionHashes() public {
        uint256 timestampMs = block.timestamp * 1000;
        bytes32[] memory sessionHashes = new bytes32[](0);
        bytes memory signature = hex"deadbeef";

        vm.expectRevert(IFinetuneProofRegistry.EmptySessionHashes.selector);
        registry.storeProof("model-001", timestampMs, sessionHashes, signature);
    }

    function test_storeProof_revertsTimestampTooFarInFuture() public {
        uint256 currentMs = block.timestamp * 1000;
        uint256 timestampMs = currentMs + registry.MAX_TIMESTAMP_WINDOW() + 1000;
        bytes32[] memory sessionHashes = _defaultSessionHashes();
        bytes memory signature = _createSignature("model-001", timestampMs, sessionHashes);

        vm.expectRevert(
            abi.encodeWithSelector(IFinetuneProofRegistry.TimestampOutOfWindow.selector, timestampMs, currentMs)
        );
        registry.storeProof("model-001", timestampMs, sessionHashes, signature);
    }

    function test_storeProof_revertsTimestampTooFarInPast() public {
        uint256 currentMs = block.timestamp * 1000;
        uint256 timestampMs = currentMs - registry.MAX_TIMESTAMP_WINDOW() - 1000;
        bytes32[] memory sessionHashes = _defaultSessionHashes();
        bytes memory signature = _createSignature("model-001", timestampMs, sessionHashes);

        vm.expectRevert(
            abi.encodeWithSelector(IFinetuneProofRegistry.TimestampOutOfWindow.selector, timestampMs, currentMs)
        );
        registry.storeProof("model-001", timestampMs, sessionHashes, signature);
    }

    function test_storeProof_revertsEmptySignature() public {
        uint256 timestampMs = block.timestamp * 1000;
        bytes32[] memory sessionHashes = _defaultSessionHashes();

        vm.expectRevert(IFinetuneProofRegistry.InvalidSignature.selector);
        registry.storeProof("model-001", timestampMs, sessionHashes, "");
    }

    function test_storeProof_revertsInvalidSignature() public {
        uint256 timestampMs = block.timestamp * 1000;
        bytes32[] memory sessionHashes = _defaultSessionHashes();

        // Malformed signature (wrong length - not 65 bytes) causes ECDSA.tryRecover to fail
        bytes memory badSig = hex"deadbeefdeadbeef";

        vm.expectRevert(IFinetuneProofRegistry.InvalidSignature.selector);
        registry.storeProof("model-001", timestampMs, sessionHashes, badSig);
    }

    function test_storeProof_withinWindow() public {
        uint256 currentMs = block.timestamp * 1000;
        // Just within the window
        uint256 timestampMs = currentMs + registry.MAX_TIMESTAMP_WINDOW() - 1000;
        bytes32[] memory sessionHashes = _defaultSessionHashes();
        bytes memory signature = _createSignature("model-001", timestampMs, sessionHashes);

        // Should not revert
        registry.storeProof("model-001", timestampMs, sessionHashes, signature);
    }

    // -------------------------------------------------------------------------
    // Get proof tests
    // -------------------------------------------------------------------------

    function test_getProof_revertsNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(IFinetuneProofRegistry.ProofNotFound.selector, 999));
        registry.getProof(999);
    }

    // -------------------------------------------------------------------------
    // Get proofs by model tests
    // -------------------------------------------------------------------------

    function test_getProofsByModel() public {
        uint256 timestampMs = block.timestamp * 1000;
        bytes32[] memory sessionHashes = _defaultSessionHashes();

        bytes memory sig1 = _createSignature("model-001", timestampMs, sessionHashes);
        bytes memory sig2 = _createSignature("model-002", timestampMs, sessionHashes);

        // Two session hashes for a different call
        bytes32[] memory sessionHashes2 = new bytes32[](1);
        sessionHashes2[0] = keccak256("session-3");
        bytes memory sig3 = _createSignature("model-001", timestampMs, sessionHashes2);

        registry.storeProof("model-001", timestampMs, sessionHashes, sig1);
        registry.storeProof("model-002", timestampMs, sessionHashes, sig2);
        registry.storeProof("model-001", timestampMs, sessionHashes2, sig3);

        uint256[] memory model1Proofs = registry.getProofsByModel("model-001");
        uint256[] memory model2Proofs = registry.getProofsByModel("model-002");

        assertEq(model1Proofs.length, 2);
        assertEq(model1Proofs[0], 0);
        assertEq(model1Proofs[1], 2);

        assertEq(model2Proofs.length, 1);
        assertEq(model2Proofs[0], 1);
    }

    function test_getProofsByModel_returnsEmptyForUnknown() public view {
        uint256[] memory proofs = registry.getProofsByModel("nonexistent");
        assertEq(proofs.length, 0);
    }

    // -------------------------------------------------------------------------
    // Verify signature tests
    // -------------------------------------------------------------------------

    function test_verifyProofSignature() public {
        uint256 timestampMs = block.timestamp * 1000;
        bytes32[] memory sessionHashes = _defaultSessionHashes();
        bytes memory signature = _createSignature("model-001", timestampMs, sessionHashes);

        uint256 proofId = registry.storeProof("model-001", timestampMs, sessionHashes, signature);

        assertTrue(registry.verifyProofSignature(proofId, signer));
        assertFalse(registry.verifyProofSignature(proofId, address(0xBEEF)));
    }

    function test_verifyProofSignature_revertsNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(IFinetuneProofRegistry.ProofNotFound.selector, 999));
        registry.verifyProofSignature(999, signer);
    }

    // -------------------------------------------------------------------------
    // Constants test
    // -------------------------------------------------------------------------

    function test_maxTimestampWindow() public view {
        assertEq(registry.MAX_TIMESTAMP_WINDOW(), 24 hours * 1000);
    }
}
