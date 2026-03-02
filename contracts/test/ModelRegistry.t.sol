// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ModelRegistry} from "../src/ModelRegistry.sol";
import {IModelRegistry, IPureSapiens} from "../src/interfaces/IPureSapiens.sol";

contract ModelRegistryTest is Test {
    ModelRegistry public registry;

    address public admin = address(0xA);
    address public modelOwner = address(0xB);
    address public server1 = address(0xC);
    address public server2 = address(0xD);
    address public unauthorized = address(0xE);

    function setUp() public {
        registry = new ModelRegistry(admin);
    }

    // -------------------------------------------------------------------------
    // Registration tests
    // -------------------------------------------------------------------------

    function test_registerModel() public {
        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        assertEq(registry.modelCount(), 1);

        IPureSapiens.ModelInfo memory model = registry.getModel("model-001");
        assertEq(model.modelId, "model-001");
        assertEq(model.owner, modelOwner);
        assertEq(model.metadataHash, "metadata-hash-123");
        assertEq(model.dockerfileHash, "dockerfile-hash-456");
        assertEq(model.createdAt, block.timestamp);
        assertEq(model.updatedAt, block.timestamp);
        assertEq(model.serverAllowlist.length, 0);
    }

    function test_registerModel_emitsEvent() public {
        bytes32 expectedIdHash = keccak256(bytes("model-001"));

        vm.expectEmit(true, true, false, true);
        emit IModelRegistry.ModelRegistered(expectedIdHash, "model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");
    }

    function test_registerModel_revertsDuplicate() public {
        vm.startPrank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        vm.expectRevert(abi.encodeWithSelector(IModelRegistry.ModelAlreadyExists.selector, "model-001"));
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");
        vm.stopPrank();
    }

    function test_registerModel_revertsNonOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", unauthorized));
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");
    }

    function test_registerModel_revertsEmptyModelId() public {
        vm.prank(admin);
        vm.expectRevert(IModelRegistry.InvalidParameters.selector);
        registry.registerModel("", modelOwner, "metadata-hash-123", "dockerfile-hash-456");
    }

    function test_registerModel_revertsEmptyMetadataHash() public {
        vm.prank(admin);
        vm.expectRevert(IModelRegistry.InvalidParameters.selector);
        registry.registerModel("model-001", modelOwner, "", "dockerfile-hash-456");
    }

    function test_registerModel_revertsEmptyDockerfileHash() public {
        vm.prank(admin);
        vm.expectRevert(IModelRegistry.InvalidParameters.selector);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "");
    }

    function test_registerModel_revertsZeroAddressOwner() public {
        vm.prank(admin);
        vm.expectRevert(IModelRegistry.InvalidParameters.selector);
        registry.registerModel("model-001", address(0), "metadata-hash-123", "dockerfile-hash-456");
    }

    function test_registerMultipleModels() public {
        vm.startPrank(admin);
        registry.registerModel("model-001", modelOwner, "meta-1", "docker-1");
        registry.registerModel("model-002", modelOwner, "meta-2", "docker-2");
        registry.registerModel("model-003", server1, "meta-3", "docker-3");
        vm.stopPrank();

        assertEq(registry.modelCount(), 3);
    }

    // -------------------------------------------------------------------------
    // Allowlist tests
    // -------------------------------------------------------------------------

    function test_updateAllowlist() public {
        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        address[] memory servers = new address[](2);
        servers[0] = server1;
        servers[1] = server2;

        vm.prank(modelOwner);
        registry.updateAllowlist("model-001", servers);

        assertTrue(registry.isServerAllowed("model-001", server1));
        assertTrue(registry.isServerAllowed("model-001", server2));
        assertFalse(registry.isServerAllowed("model-001", unauthorized));
    }

    function test_updateAllowlist_emitsEvent() public {
        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        address[] memory servers = new address[](1);
        servers[0] = server1;

        bytes32 expectedIdHash = keccak256(bytes("model-001"));
        vm.expectEmit(true, false, false, true);
        emit IModelRegistry.AllowlistUpdated(expectedIdHash, "model-001", servers);

        vm.prank(modelOwner);
        registry.updateAllowlist("model-001", servers);
    }

    function test_updateAllowlist_replacesExisting() public {
        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        // First allowlist
        address[] memory servers1 = new address[](1);
        servers1[0] = server1;
        vm.prank(modelOwner);
        registry.updateAllowlist("model-001", servers1);
        assertTrue(registry.isServerAllowed("model-001", server1));

        // Replace with different allowlist
        address[] memory servers2 = new address[](1);
        servers2[0] = server2;
        vm.prank(modelOwner);
        registry.updateAllowlist("model-001", servers2);

        assertFalse(registry.isServerAllowed("model-001", server1));
        assertTrue(registry.isServerAllowed("model-001", server2));
    }

    function test_updateAllowlist_revertsModelNotFound() public {
        address[] memory servers = new address[](1);
        servers[0] = server1;

        vm.prank(modelOwner);
        vm.expectRevert(abi.encodeWithSelector(IModelRegistry.ModelNotFound.selector, "nonexistent"));
        registry.updateAllowlist("nonexistent", servers);
    }

    function test_updateAllowlist_revertsUnauthorized() public {
        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        address[] memory servers = new address[](1);
        servers[0] = server1;

        vm.prank(unauthorized);
        vm.expectRevert(IModelRegistry.Unauthorized.selector);
        registry.updateAllowlist("model-001", servers);
    }

    function test_updateAllowlist_updatesTimestamp() public {
        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        IPureSapiens.ModelInfo memory before = registry.getModel("model-001");
        uint256 createdTimestamp = before.createdAt;

        vm.warp(block.timestamp + 1 hours);

        address[] memory servers = new address[](1);
        servers[0] = server1;
        vm.prank(modelOwner);
        registry.updateAllowlist("model-001", servers);

        IPureSapiens.ModelInfo memory model = registry.getModel("model-001");
        assertEq(model.createdAt, createdTimestamp);
        assertGt(model.updatedAt, createdTimestamp);
    }

    // -------------------------------------------------------------------------
    // View function tests
    // -------------------------------------------------------------------------

    function test_isServerAllowed_returnsFalseForNonexistentModel() public view {
        assertFalse(registry.isServerAllowed("nonexistent", server1));
    }

    function test_getModel_revertsModelNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(IModelRegistry.ModelNotFound.selector, "nonexistent"));
        registry.getModel("nonexistent");
    }

    function test_getDockerfileHash_ownerCanAccess() public {
        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        string memory hash = registry.getDockerfileHash("model-001", modelOwner);
        assertEq(hash, "dockerfile-hash-456");
    }

    function test_getDockerfileHash_allowedServerCanAccess() public {
        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        address[] memory servers = new address[](1);
        servers[0] = server1;
        vm.prank(modelOwner);
        registry.updateAllowlist("model-001", servers);

        string memory hash = registry.getDockerfileHash("model-001", server1);
        assertEq(hash, "dockerfile-hash-456");
    }

    function test_getDockerfileHash_revertsUnauthorized() public {
        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        vm.expectRevert(IModelRegistry.Unauthorized.selector);
        registry.getDockerfileHash("model-001", unauthorized);
    }

    function test_getDockerfileHash_revertsModelNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(IModelRegistry.ModelNotFound.selector, "nonexistent"));
        registry.getDockerfileHash("nonexistent", modelOwner);
    }

    function test_getMetadataHash() public {
        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        string memory hash = registry.getMetadataHash("model-001");
        assertEq(hash, "metadata-hash-123");
    }

    function test_getMetadataHash_revertsModelNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(IModelRegistry.ModelNotFound.selector, "nonexistent"));
        registry.getMetadataHash("nonexistent");
    }

    function test_getModel_includesAllowlist() public {
        vm.prank(admin);
        registry.registerModel("model-001", modelOwner, "metadata-hash-123", "dockerfile-hash-456");

        address[] memory servers = new address[](2);
        servers[0] = server1;
        servers[1] = server2;
        vm.prank(modelOwner);
        registry.updateAllowlist("model-001", servers);

        IPureSapiens.ModelInfo memory model = registry.getModel("model-001");
        assertEq(model.serverAllowlist.length, 2);
    }
}
