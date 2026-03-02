// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrainingDataManager} from "../src/TrainingDataManager.sol";

contract TrainingDataManagerTest is Test {
    TrainingDataManager public manager;

    address public admin = address(0xA);
    address public forwarder = address(0xB);
    address public unauthorized = address(0xC);

    function setUp() public {
        manager = new TrainingDataManager(admin, forwarder);
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    function test_constructor() public view {
        assertEq(manager.owner(), admin);
        assertEq(manager.creForwarder(), forwarder);
    }

    // -------------------------------------------------------------------------
    // Assign training data
    // -------------------------------------------------------------------------

    function test_assignTrainingData_byForwarder() public {
        vm.prank(forwarder);
        manager.assignTrainingData("model-001", "blob-abc-123", 85);

        string[] memory data = manager.getTrainingData("model-001");
        assertEq(data.length, 1);
        assertEq(data[0], "blob-abc-123");
    }

    function test_assignTrainingData_byOwner() public {
        vm.prank(admin);
        manager.assignTrainingData("model-001", "blob-abc-123", 90);

        string[] memory data = manager.getTrainingData("model-001");
        assertEq(data.length, 1);
    }

    function test_assignTrainingData_emitsEvent() public {
        bytes32 expectedHash = keccak256(bytes("model-001"));

        vm.expectEmit(true, false, false, true);
        emit TrainingDataManager.TrainingDataAssigned(expectedHash, "model-001", "blob-abc-123", 85);

        vm.prank(forwarder);
        manager.assignTrainingData("model-001", "blob-abc-123", 85);
    }

    function test_assignTrainingData_multipleBlobs() public {
        vm.startPrank(forwarder);
        manager.assignTrainingData("model-001", "blob-1", 80);
        manager.assignTrainingData("model-001", "blob-2", 75);
        manager.assignTrainingData("model-001", "blob-3", 90);
        vm.stopPrank();

        string[] memory data = manager.getTrainingData("model-001");
        assertEq(data.length, 3);
        assertEq(data[0], "blob-1");
        assertEq(data[1], "blob-2");
        assertEq(data[2], "blob-3");
    }

    function test_assignTrainingData_differentModels() public {
        vm.startPrank(forwarder);
        manager.assignTrainingData("model-001", "blob-1", 80);
        manager.assignTrainingData("model-002", "blob-2", 75);
        vm.stopPrank();

        assertEq(manager.getTrainingData("model-001").length, 1);
        assertEq(manager.getTrainingData("model-002").length, 1);
    }

    function test_assignTrainingData_revertsUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(TrainingDataManager.UnauthorizedForwarder.selector);
        manager.assignTrainingData("model-001", "blob-1", 80);
    }

    function test_assignTrainingData_revertsEmptyModelId() public {
        vm.prank(forwarder);
        vm.expectRevert(TrainingDataManager.EmptyModelId.selector);
        manager.assignTrainingData("", "blob-1", 80);
    }

    function test_assignTrainingData_revertsEmptyBlobId() public {
        vm.prank(forwarder);
        vm.expectRevert(TrainingDataManager.EmptyBlobId.selector);
        manager.assignTrainingData("model-001", "", 80);
    }

    function test_assignTrainingData_revertsDuplicate() public {
        vm.startPrank(forwarder);
        manager.assignTrainingData("model-001", "blob-1", 80);

        vm.expectRevert(abi.encodeWithSelector(TrainingDataManager.BlobAlreadyAssigned.selector, "model-001", "blob-1"));
        manager.assignTrainingData("model-001", "blob-1", 90);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    function test_getTrainingData_returnsEmptyForUnknown() public view {
        string[] memory data = manager.getTrainingData("nonexistent");
        assertEq(data.length, 0);
    }

    function test_getTrainingDataCount() public {
        vm.startPrank(forwarder);
        manager.assignTrainingData("model-001", "blob-1", 80);
        manager.assignTrainingData("model-001", "blob-2", 75);
        vm.stopPrank();

        assertEq(manager.getTrainingDataCount("model-001"), 2);
        assertEq(manager.getTrainingDataCount("nonexistent"), 0);
    }

    function test_isBlobAssigned() public {
        vm.prank(forwarder);
        manager.assignTrainingData("model-001", "blob-1", 80);

        assertTrue(manager.isBlobAssigned("model-001", "blob-1"));
        assertFalse(manager.isBlobAssigned("model-001", "blob-2"));
        assertFalse(manager.isBlobAssigned("model-002", "blob-1"));
    }

    // -------------------------------------------------------------------------
    // Forwarder management
    // -------------------------------------------------------------------------

    function test_setForwarder() public {
        address newForwarder = address(0xD);

        vm.prank(admin);
        manager.setForwarder(newForwarder);

        assertEq(manager.creForwarder(), newForwarder);
    }

    function test_setForwarder_emitsEvent() public {
        address newForwarder = address(0xD);

        vm.expectEmit(true, true, false, false);
        emit TrainingDataManager.ForwarderUpdated(forwarder, newForwarder);

        vm.prank(admin);
        manager.setForwarder(newForwarder);
    }

    function test_setForwarder_revertsNonOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", unauthorized));
        manager.setForwarder(address(0xD));
    }

    function test_setForwarder_newForwarderCanAssign() public {
        address newForwarder = address(0xD);

        vm.prank(admin);
        manager.setForwarder(newForwarder);

        // Old forwarder should fail
        vm.prank(forwarder);
        vm.expectRevert(TrainingDataManager.UnauthorizedForwarder.selector);
        manager.assignTrainingData("model-001", "blob-1", 80);

        // New forwarder should work
        vm.prank(newForwarder);
        manager.assignTrainingData("model-001", "blob-1", 80);

        assertEq(manager.getTrainingData("model-001").length, 1);
    }
}
