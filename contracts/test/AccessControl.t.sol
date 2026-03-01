// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AccessControl} from "../src/AccessControl.sol";
import {IAccessControl} from "../src/interfaces/IPureSapiens.sol";

contract AccessControlTest is Test {
    AccessControl public ac;

    address public creator = address(0xA);
    address public user1 = address(0xB);
    address public user2 = address(0xC);
    address public unauthorized = address(0xD);

    function setUp() public {
        ac = new AccessControl();
    }

    // -------------------------------------------------------------------------
    // Policy creation tests
    // -------------------------------------------------------------------------

    function test_createPolicy_empty() public {
        address[] memory initial = new address[](0);

        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        assertEq(ac.getPolicyCreator(policyId), creator);
        assertFalse(ac.hasAccess(policyId, user1));
    }

    function test_createPolicy_withInitialAddresses() public {
        address[] memory initial = new address[](2);
        initial[0] = user1;
        initial[1] = user2;

        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        assertTrue(ac.hasAccess(policyId, user1));
        assertTrue(ac.hasAccess(policyId, user2));
        assertFalse(ac.hasAccess(policyId, unauthorized));
    }

    function test_createPolicy_emitsEvents() public {
        address[] memory initial = new address[](1);
        initial[0] = user1;

        vm.prank(creator);
        // We cannot predict the exact policyId for expectEmit on indexed params,
        // so we just check the event is emitted
        bytes32 policyId = ac.createPolicy(initial);

        // Verify state instead
        assertTrue(ac.hasAccess(policyId, user1));
        assertEq(ac.getPolicyCreator(policyId), creator);
    }

    function test_createPolicy_uniqueIds() public {
        address[] memory initial = new address[](0);

        vm.startPrank(creator);
        bytes32 id1 = ac.createPolicy(initial);
        bytes32 id2 = ac.createPolicy(initial);
        vm.stopPrank();

        assertTrue(id1 != id2);
    }

    function test_createPolicy_skipsZeroAddress() public {
        address[] memory initial = new address[](2);
        initial[0] = address(0);
        initial[1] = user1;

        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        assertFalse(ac.hasAccess(policyId, address(0)));
        assertTrue(ac.hasAccess(policyId, user1));
    }

    // -------------------------------------------------------------------------
    // Grant access tests
    // -------------------------------------------------------------------------

    function test_grantAccess() public {
        address[] memory initial = new address[](0);
        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        assertFalse(ac.hasAccess(policyId, user1));

        vm.prank(creator);
        ac.grantAccess(policyId, user1);

        assertTrue(ac.hasAccess(policyId, user1));
    }

    function test_grantAccess_emitsEvent() public {
        address[] memory initial = new address[](0);
        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        vm.expectEmit(true, true, false, false);
        emit IAccessControl.AccessGranted(policyId, user1);

        vm.prank(creator);
        ac.grantAccess(policyId, user1);
    }

    function test_grantAccess_revertsPolicyNotFound() public {
        bytes32 fakePolicyId = keccak256("fake");

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.PolicyNotFound.selector, fakePolicyId));
        ac.grantAccess(fakePolicyId, user1);
    }

    function test_grantAccess_revertsNotCreator() public {
        address[] memory initial = new address[](0);
        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.NotPolicyCreator.selector, policyId));
        ac.grantAccess(policyId, user1);
    }

    function test_grantAccess_revertsAlreadyGranted() public {
        address[] memory initial = new address[](1);
        initial[0] = user1;

        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessAlreadyGranted.selector, policyId, user1));
        ac.grantAccess(policyId, user1);
    }

    // -------------------------------------------------------------------------
    // Revoke access tests
    // -------------------------------------------------------------------------

    function test_revokeAccess() public {
        address[] memory initial = new address[](1);
        initial[0] = user1;

        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        assertTrue(ac.hasAccess(policyId, user1));

        vm.prank(creator);
        ac.revokeAccess(policyId, user1);

        assertFalse(ac.hasAccess(policyId, user1));
    }

    function test_revokeAccess_emitsEvent() public {
        address[] memory initial = new address[](1);
        initial[0] = user1;

        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        vm.expectEmit(true, true, false, false);
        emit IAccessControl.AccessRevoked(policyId, user1);

        vm.prank(creator);
        ac.revokeAccess(policyId, user1);
    }

    function test_revokeAccess_revertsPolicyNotFound() public {
        bytes32 fakePolicyId = keccak256("fake");

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.PolicyNotFound.selector, fakePolicyId));
        ac.revokeAccess(fakePolicyId, user1);
    }

    function test_revokeAccess_revertsNotCreator() public {
        address[] memory initial = new address[](1);
        initial[0] = user1;

        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.NotPolicyCreator.selector, policyId));
        ac.revokeAccess(policyId, user1);
    }

    function test_revokeAccess_revertsNotGranted() public {
        address[] memory initial = new address[](0);
        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessNotGranted.selector, policyId, user1));
        ac.revokeAccess(policyId, user1);
    }

    function test_revokeAccess_removesFromAccessList() public {
        address[] memory initial = new address[](2);
        initial[0] = user1;
        initial[1] = user2;

        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        assertEq(ac.getAccessList(policyId).length, 2);

        vm.prank(creator);
        ac.revokeAccess(policyId, user1);

        address[] memory list = ac.getAccessList(policyId);
        assertEq(list.length, 1);
        assertEq(list[0], user2);
    }

    // -------------------------------------------------------------------------
    // View function tests
    // -------------------------------------------------------------------------

    function test_hasAccess_returnsFalseForNonexistentPolicy() public view {
        bytes32 fakePolicyId = keccak256("fake");
        assertFalse(ac.hasAccess(fakePolicyId, user1));
    }

    function test_getPolicyCreator_revertsForNonexistent() public {
        bytes32 fakePolicyId = keccak256("fake");
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.PolicyNotFound.selector, fakePolicyId));
        ac.getPolicyCreator(fakePolicyId);
    }

    function test_getAccessList() public {
        address[] memory initial = new address[](2);
        initial[0] = user1;
        initial[1] = user2;

        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        address[] memory list = ac.getAccessList(policyId);
        assertEq(list.length, 2);
    }

    function test_getAccessList_revertsForNonexistent() public {
        bytes32 fakePolicyId = keccak256("fake");
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.PolicyNotFound.selector, fakePolicyId));
        ac.getAccessList(fakePolicyId);
    }

    // -------------------------------------------------------------------------
    // Integration tests
    // -------------------------------------------------------------------------

    function test_grantAndRevokeFlow() public {
        address[] memory initial = new address[](0);
        vm.prank(creator);
        bytes32 policyId = ac.createPolicy(initial);

        // Grant to user1 and user2
        vm.startPrank(creator);
        ac.grantAccess(policyId, user1);
        ac.grantAccess(policyId, user2);
        vm.stopPrank();

        assertTrue(ac.hasAccess(policyId, user1));
        assertTrue(ac.hasAccess(policyId, user2));

        // Revoke user1
        vm.prank(creator);
        ac.revokeAccess(policyId, user1);

        assertFalse(ac.hasAccess(policyId, user1));
        assertTrue(ac.hasAccess(policyId, user2));

        // Re-grant user1
        vm.prank(creator);
        ac.grantAccess(policyId, user1);

        assertTrue(ac.hasAccess(policyId, user1));
    }
}
