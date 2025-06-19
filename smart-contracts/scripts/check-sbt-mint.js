const { task } = require("hardhat/config");
const fs = require('fs');
require('dotenv').config();

// Define a Hardhat task to check SBT mint status
task("check-sbt-mint", "Check the status of a pending SBT minting transaction")
  .addOptionalPositionalParam("txhash", "The transaction hash to check")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    await checkSBTMintStatus(taskArgs.txhash, ethers);
  });

async function checkSBTMintStatus(cmdLineTxHash, ethers) {
    console.log("🔍 Checking SBT Minting Transaction Status...\n");

    try {
        // Get pending transaction hash from .env or argument
        let pendingTxHash = process.env.SBT_PENDING_TX;
        
        // Check if provided as task argument
        if (cmdLineTxHash) {
            pendingTxHash = cmdLineTxHash;
            console.log(`🔍 Using transaction hash from command line: ${pendingTxHash}`);
        }
        
        if (!pendingTxHash) {
            throw new Error("No pending transaction hash found. Please provide it as an argument or set SBT_PENDING_TX in .env");
        }

        console.log(`🔍 Checking transaction: ${pendingTxHash}`);
        
        // Get network and provider
        const network = await ethers.provider.getNetwork();
        console.log(`🌐 Network: ${network.name} (chainId: ${network.chainId})`);

        // Get transaction
        const tx = await ethers.provider.getTransaction(pendingTxHash);
        if (!tx) {
            throw new Error(`Transaction not found: ${pendingTxHash}`);
        }
        
        console.log(`📄 Transaction found: ${pendingTxHash}`);
        console.log(`👤 From: ${tx.from}`);
        console.log(`📄 To: ${tx.to}`);
        
        // Get receipt
        const receipt = await ethers.provider.getTransactionReceipt(pendingTxHash);
        if (!receipt) {
            console.log("\n⏳ TRANSACTION PENDING");
            console.log("═".repeat(70));
            console.log(`🔍 Transaction is still pending. Check back later.`);
            
            if (network.name === 'sepolia' || network.chainId === 11155111) {
                console.log(`🌐 Etherscan: https://sepolia.etherscan.io/tx/${pendingTxHash}`);
            }
            
            return {
                status: "pending",
                hash: pendingTxHash
            };
        }
        
        console.log(`📦 Block Number: ${receipt.blockNumber}`);
        console.log(`⛽ Gas Used: ${receipt.gasUsed.toString()}`);
        
        // Check status
        if (receipt.status === 1) {
            console.log("\n✅ TRANSACTION SUCCESSFUL");
            console.log("═".repeat(70));
            
            // Get SBT contract
            const sbtContractAddress = process.env.SBT_CONTRACT_ADDRESS;
            if (!sbtContractAddress) {
                console.log("⚠️ SBT_CONTRACT_ADDRESS not found in .env file.");
                return {
                    status: "success",
                    hash: pendingTxHash,
                    receipt: receipt
                };
            }
            
            // Connect to SBT contract
            const SBT = await ethers.getContractFactory("SBT");
            const sbt = SBT.attach(sbtContractAddress);
            
            // Try to extract token ID from logs
            let tokenId = null;
            for (const log of receipt.logs) {
                try {
                    if (log.address.toLowerCase() === sbtContractAddress.toLowerCase()) {
                        const parsedLog = sbt.interface.parseLog(log);
                        if (parsedLog && parsedLog.name === 'SBTMinted') {
                            tokenId = parsedLog.args.tokenId.toString();
                            break;
                        }
                    }
                } catch (error) {
                    // Skip unparseable logs
                }
            }
            
            if (tokenId) {
                console.log(`🎖️ SBT Token ID: ${tokenId}`);
                
                // Get token info
                try {
                    const tokenURI = await sbt.tokenURI(tokenId);
                    const tokenOwner = await sbt.ownerOf(tokenId);
                    const tokenDID = await sbt.tokenDID(tokenId);
                    const latestVCHash = await sbt.getLatestVC(tokenId);
                    
                    console.log("\n📋 SBT DETAILS:");
                    console.log("═".repeat(70));
                    console.log(`🆔 Token ID: ${tokenId}`);
                    console.log(`👤 Owner: ${tokenOwner}`);
                    console.log(`🔗 Token URI: ${tokenURI}`);
                    console.log(`🆔 DID: ${tokenDID}`);
                    console.log(`🔐 VC Hash: ${latestVCHash}`);
                    
                    // Update .env with token ID
                    let envContent = fs.readFileSync('.env', 'utf8');
                    
                    // Remove pending tx
                    envContent = envContent
                        .split('\n')
                        .filter(line => !line.startsWith('SBT_PENDING_TX='))
                        .join('\n');
                    
                    // Add token info
                    const newEnvVars = `
# SBT Minting (Step 5)
SBT_TOKEN_ID=${tokenId}
SBT_MINTING_TX=${pendingTxHash}
SBT_MINTED_AT=${new Date().toISOString()}
`;
                    
                    envContent += newEnvVars;
                    fs.writeFileSync('.env', envContent);
                    console.log(`✅ .env updated with token info`);
                    
                    // Save minting info
                    const mintingInfo = {
                        tokenId: tokenId,
                        owner: tokenOwner,
                        did: tokenDID,
                        tokenURI: tokenURI,
                        vcHash: latestVCHash,
                        transactionHash: pendingTxHash,
                        blockNumber: receipt.blockNumber,
                        gasUsed: receipt.gasUsed.toString(),
                        contractAddress: sbtContractAddress,
                        mintedAt: new Date().toISOString(),
                        network: network.name,
                        chainId: network.chainId.toString()
                    };
                    
                    const mintingFile = "./data/contracts/sbt-minting.json";
                    fs.writeFileSync(mintingFile, JSON.stringify(mintingInfo, null, 2));
                    console.log(`💾 Minting info saved to: ${mintingFile}`);
                    
                } catch (error) {
                    console.log(`⚠️ Error getting token details: ${error.message}`);
                }
            } else {
                console.log("⚠️ Could not extract token ID from transaction logs");
            }
            
            // Show Etherscan link
            if (network.name === 'sepolia' || network.chainId === 11155111) {
                console.log(`🌐 Etherscan: https://sepolia.etherscan.io/tx/${pendingTxHash}`);
            }
            
            return {
                status: "success",
                hash: pendingTxHash,
                receipt: receipt,
                tokenId: tokenId
            };
            
        } else {
            console.log("\n❌ TRANSACTION FAILED");
            console.log("═".repeat(70));
            console.log(`⚠️ Transaction reverted or failed.`);
            
            // Show Etherscan link
            if (network.name === 'sepolia' || network.chainId === 11155111) {
                console.log(`🌐 Etherscan: https://sepolia.etherscan.io/tx/${pendingTxHash}`);
            }
            
            return {
                status: "failed",
                hash: pendingTxHash,
                receipt: receipt
            };
        }
        
    } catch (error) {
        console.error("\n❌ ERROR CHECKING TRANSACTION:");
        console.error("═".repeat(70));
        console.error("Error:", error.message);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    console.log("Run this script using 'npx hardhat check-sbt-mint --network <network>'");
    process.exit(0);
}

module.exports = {}; 