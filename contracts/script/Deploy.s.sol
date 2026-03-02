// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ModelRegistry} from "../src/ModelRegistry.sol";
import {AccessControl} from "../src/AccessControl.sol";
import {FinetuneProofRegistry} from "../src/FinetuneProofRegistry.sol";
import {TrainingDataManager} from "../src/TrainingDataManager.sol";

/// @title Deploy - Deployment script for all PureSapiens contracts
/// @notice Deploys ModelRegistry, AccessControl, FinetuneProofRegistry, and TrainingDataManager
/// @dev Run with: forge script script/Deploy.s.sol --rpc-url <RPC_URL> --broadcast --verify
contract Deploy is Script {
    function run() external {
        address deployer = msg.sender;
        // CRE DON forwarder address — update after CRE workflow deployment
        address creForwarder = vm.envOr("CRE_FORWARDER", deployer);

        console.log("Deployer:", deployer);
        console.log("CRE Forwarder:", creForwarder);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast();

        ModelRegistry modelRegistry = new ModelRegistry(deployer);
        console.log("ModelRegistry deployed at:", address(modelRegistry));

        AccessControl accessControl = new AccessControl();
        console.log("AccessControl deployed at:", address(accessControl));

        FinetuneProofRegistry finetuneProofRegistry = new FinetuneProofRegistry();
        console.log("FinetuneProofRegistry deployed at:", address(finetuneProofRegistry));

        TrainingDataManager trainingDataManager = new TrainingDataManager(deployer, creForwarder);
        console.log("TrainingDataManager deployed at:", address(trainingDataManager));

        vm.stopBroadcast();

        console.log("--- Deployment complete ---");
    }
}
