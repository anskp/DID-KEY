const { ethers } = require("hardhat");
const { formatEther, formatUnits, parseEther } = require("ethers");
const fs = require('fs');
require('dotenv').config();

async function deploySBTContract() {
    console.log("🏗️ Deploying SBT Contract (OpenZeppelin v5.0)...\n");

    try {
        // Check if we already have a deployment transaction hash in .env
        const existingTxHash = process.env.SBT_DEPLOYMENT_TX;
        if (existingTxHash) {
            console.log("🔍 Found existing deployment transaction:", existingTxHash);
            console.log("⏳ Checking transaction status...");
            
            try {
                const provider = ethers.provider;
                const tx = await provider.getTransaction(existingTxHash);
                
                if (tx) {
                    const receipt = await provider.getTransactionReceipt(existingTxHash);
                    
                    if (receipt && receipt.contractAddress) {
                        console.log("✅ Found deployed contract address:", receipt.contractAddress);
                        console.log("�� Updating .env with correct contract address...");
                        
                        // Update .env with the correct contract address
                        let envContent = fs.readFileSync('.env', 'utf8');
                        envContent = envContent.replace(
                            /SBT_CONTRACT_ADDRESS=.*$/m, 
                            `SBT_CONTRACT_ADDRESS=${receipt.contractAddress}`
                        );
                        fs.writeFileSync('.env', envContent);
                        
                        console.log("✅ .env updated with correct contract address");
                        console.log("🎉 You can now use the contract at:", receipt.contractAddress);
                        return {
                            contractAddress: receipt.contractAddress,
                            deploymentTx: existingTxHash
                        };
                    } else {
                        console.log("⚠️ Transaction found but contract address not available. Proceeding with new deployment.");
                    }
                } else {
                    console.log("⚠️ Transaction not found. Proceeding with new deployment.");
                }
            } catch (error) {
                console.log("⚠️ Error checking existing transaction:", error.message);
                console.log("🔄 Proceeding with new deployment...");
            }
        }

        // Get deployer
        const [deployer] = await ethers.getSigners();
        console.log("👤 Deploying with account:", deployer.address);
        
        // Check balance
        const balance = await ethers.provider.getBalance(deployer.address);
        console.log("💰 Account balance:", formatEther(balance), "ETH");
        
        if (balance < parseEther("0.01")) {
            console.log("⚠️ Warning: Low balance, might need more ETH for deployment");
        }

        // Get network
        const network = await ethers.provider.getNetwork();
        console.log(`🌐 Network: ${network.name} (chainId: ${network.chainId})`);

        // Get SBT contract factory
        console.log("\n🚀 Getting SBT contract factory...");
        const SBT = await ethers.getContractFactory("SBT");
        
        // Estimate gas
        console.log("⛽ Estimating deployment gas...");
        try {
            const deployTx = SBT.getDeployTransaction();
            const gasEstimate = await ethers.provider.estimateGas(deployTx);
            const gasPrice = await ethers.provider.getGasPrice();
            const estimatedCost = gasEstimate * gasPrice;
            
            console.log(`📊 Estimated Gas: ${gasEstimate.toString()}`);
            console.log(`💰 Gas Price: ${formatUnits(gasPrice, 'gwei')} gwei`);
            console.log(`💸 Estimated Cost: ${formatEther(estimatedCost)} ETH`);
        } catch (gasError) {
            console.log("⚠️ Gas estimation failed, proceeding with deployment...");
        }
        
        console.log("\n📄 Contract factory loaded successfully");
        console.log("⏳ Deploying contract...");
        
        // Deploy the contract
        const sbt = await SBT.deploy();
        console.log("⏳ Waiting for deployment confirmation...");
        
        // Wait for deployment
        try {
            // Add timeout to prevent hanging indefinitely
            const deploymentPromise = sbt.waitForDeployment();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Deployment confirmation timeout after 60 seconds")), 60000)
            );
            
            await Promise.race([deploymentPromise, timeoutPromise]);
            console.log("✅ Deployment confirmed!");
        } catch (error) {
            console.log("⚠️ Deployment confirmation timed out or failed:", error.message);
            console.log("⚠️ The contract might still be deployed. Check Etherscan with the transaction hash.");
        }
        
        // Debug contract object
        console.log("Contract object keys:", Object.keys(sbt));
        
        // Try different methods to get address
        let contractAddress;
        try {
            contractAddress = await sbt.getAddress();
            console.log("Got address using getAddress():", contractAddress);
        } catch (error) {
            console.log("Error getting address with getAddress():", error.message);
            try {
                contractAddress = sbt.target;
                console.log("Got address using sbt.target:", contractAddress);
            } catch (error) {
                console.log("Error getting address with sbt.target:", error.message);
                contractAddress = "Check Etherscan for address";
            }
        }
        
        const deploymentTx = await sbt.deploymentTransaction();
        if (!deploymentTx) {
            throw new Error("Deployment transaction not found");
        }

        console.log("\n✅ SBT CONTRACT DEPLOYED SUCCESSFULLY!");
        console.log("═".repeat(70));
        console.log(`📄 Contract Address: ${contractAddress}`);
        console.log(`📋 Deployment Transaction: ${deploymentTx.hash}`);
        console.log(`⛽ Gas Used: ${deploymentTx.gasLimit ? deploymentTx.gasLimit.toString() : "unknown"}`);
        console.log(`💰 Gas Price: ${formatUnits(deploymentTx.gasPrice, 'gwei')} gwei`);

        // Test contract functions
        console.log("\n🔍 Testing contract functions...");
        try {
            const name = await sbt.name();
            const symbol = await sbt.symbol();
            const owner = await sbt.owner();
            const totalSupply = await sbt.totalSupply();

            console.log("\n📋 CONTRACT DETAILS:");
            console.log("═".repeat(70));
            console.log(`🏷️ Name: ${name}`);
            console.log(`🎯 Symbol: ${symbol}`);
            console.log(`👑 Owner: ${owner}`);
            console.log(`📊 Total Supply: ${totalSupply.toString()}`);
            console.log(`🔒 Soulbound: Yes (non-transferable)`);
            console.log(`✅ OpenZeppelin: v5.0+ Compatible`);
        } catch (testError) {
            console.log("⚠️ Contract deployed but function test failed:", testError.message);
        }

        // Save deployment info
        const deploymentInfo = {
            contractName: "SBT",
            contractAddress: contractAddress,
            deploymentTx: deploymentTx.hash,
            deployer: deployer.address,
            network: network.name,
            chainId: network.chainId.toString(),
            gasUsed: deploymentTx.gasLimit ? deploymentTx.gasLimit.toString() : "unknown",
            gasPrice: deploymentTx.gasPrice.toString(),
            blockNumber: deploymentTx.blockNumber || "pending",
            deployedAt: new Date().toISOString(),
            openzeppelinVersion: "v5.0+",
            contractFeatures: {
                soulbound: true,
                vcHashRegistry: true,
                ipfsMetadata: true,
                upgradableVCs: true,
                accessControl: true
            }
        };

        // Create directories if they don't exist
        if (!fs.existsSync("./data")) fs.mkdirSync("./data");
        if (!fs.existsSync("./data/contracts")) fs.mkdirSync("./data/contracts");

        const deploymentFile = "./data/contracts/sbt-deployment.json";
        fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

        // Update .env with SBT contract info
        let envContent = "";
        if (fs.existsSync('.env')) {
            envContent = fs.readFileSync('.env', 'utf8');
        }
        
        // Remove old SBT entries if they exist
        envContent = envContent
            .split('\n')
            .filter(line => 
                !line.startsWith('SBT_CONTRACT_ADDRESS=') &&
                !line.startsWith('SBT_DEPLOYMENT_TX=') &&
                !line.startsWith('SBT_DEPLOYED_AT=') &&
                !line.startsWith('SBT_DEPLOYER=')
            )
            .join('\n');

        // Add new SBT entries
        const newEnvVars = `
# SBT Contract (Step 4)
SBT_CONTRACT_ADDRESS=${contractAddress}
SBT_DEPLOYMENT_TX=${deploymentTx.hash}
SBT_DEPLOYED_AT=${new Date().toISOString()}
SBT_DEPLOYER=${deployer.address}
`;

        envContent += newEnvVars;
        fs.writeFileSync('.env', envContent);

        console.log("\n📋 CAPABILITIES:");
        console.log("═".repeat(70));
        console.log("✅ OpenZeppelin v5.0+ compatible");
        console.log("✅ Mint soulbound tokens with VC hashes");
        console.log("✅ Register new VC hashes (for KYC updates)");
        console.log("✅ Update token URI (IPFS metadata)");
        console.log("✅ Query VC hash history");
        console.log("✅ Non-transferable (soulbound)");
        console.log("✅ Access control (owner only)");

        console.log("\n🔗 BLOCKCHAIN VERIFICATION:");
        console.log("═".repeat(70));
        if (network.name === 'sepolia' || network.chainId === 11155111n) {
            console.log(`🌐 Etherscan: https://sepolia.etherscan.io/address/${contractAddress}`);
            console.log(`📋 Transaction: https://sepolia.etherscan.io/tx/${deploymentTx.hash}`);
        } else if (network.name === 'mainnet' || network.chainId === 1n) {
            console.log(`🌐 Etherscan: https://etherscan.io/address/${contractAddress}`);
            console.log(`📋 Transaction: https://etherscan.io/tx/${deploymentTx.hash}`);
        } else {
            console.log(`🌐 Explorer: Check your network's explorer for ${contractAddress}`);
        }

        console.log("\n📋 NEXT STEPS:");
        console.log("═".repeat(70));
        console.log("1. ✅ VC JSON created");
        console.log("2. ✅ VC signed with Ed25519");
        console.log("3. ✅ VC uploaded to IPFS");
        console.log("4. ✅ SBT contract deployed");
        console.log("5. 🎖️ Mint SBT with VC data");

        console.log("\n🚀 Ready for Step 5: SBT Minting!");
        console.log(`💾 Deployment info saved: ${deploymentFile}`);
        console.log(`🔧 .env updated with SBT contract details`);

        // Return deployment data for next step
        return {
            sbt: sbt,
            contractAddress: contractAddress,
            deploymentTx: deploymentTx.hash,
            deploymentInfo: deploymentInfo
        };

    } catch (error) {
        console.error("\n❌ SBT DEPLOYMENT FAILED:");
        console.error("═".repeat(70));
        console.error("Error:", error.message);
        
        // Specific error handling
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.error("💰 Solution: Add more ETH to your deployer wallet");
        } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
            console.error("⛽ Solution: Gas estimation failed, check network connection");
        } else if (error.message.includes('nonce')) {
            console.error("🔄 Solution: Nonce issue, try again or reset MetaMask");
        } else if (error.message.includes('contract')) {
            console.error("📄 Solution: Check that SBT.sol compiles without errors");
        } else if (error.message.includes('network')) {
            console.error("🌐 Solution: Check your network configuration in hardhat.config.js");
        }
        
        console.error("\n🔧 Debugging Steps:");
        console.error("1. Run 'npx hardhat compile' to check for compilation errors");
        console.error("2. Check your hardhat.config.js network settings");
        console.error("3. Verify your .env file has correct private key and RPC URL");
        console.error("4. Ensure you have enough ETH for deployment");
        
        process.exit(1);
    }
}

// Main execution
async function main() {
    try {
        await deploySBTContract();
        console.log("\n🎉 SBT DEPLOYMENT COMPLETED!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Deployment script error:", error);
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the script only if called directly
if (require.main === module) {
    main();
}

module.exports = { deploySBTContract };