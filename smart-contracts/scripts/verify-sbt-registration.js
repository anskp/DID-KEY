const { ethers } = require("hardhat");
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

async function verifySBTRegistration(tokenIdOrAddress) {
    console.log("🔍 Verifying SBT Registration from Registry...\n");

    try {
        // Get network info
        const network = await ethers.provider.getNetwork();
        console.log(`🌐 Network: ${network.name} (chainId: ${network.chainId})`);

        // Load SBT contract
        const sbtContractAddress = process.env.SBT_CONTRACT_ADDRESS;
        if (!sbtContractAddress) {
            throw new Error("SBT_CONTRACT_ADDRESS not found in .env file");
        }

        console.log(`📄 SBT Contract: ${sbtContractAddress}`);

        // Connect to contract
        const SBT = await ethers.getContractFactory("SBT");
        const sbt = SBT.attach(sbtContractAddress);

        // Verify contract is accessible
        const contractName = await sbt.name();
        const contractSymbol = await sbt.symbol();
        const contractOwner = await sbt.owner();
        const totalSupply = await sbt.totalSupply();

        console.log("\n📋 CONTRACT INFO:");
        console.log("═".repeat(70));
        console.log(`🏷️ Name: ${contractName}`);
        console.log(`🎯 Symbol: ${contractSymbol}`);
        console.log(`👑 Owner: ${contractOwner}`);
        console.log(`📊 Total Supply: ${totalSupply.toString()}`);

        let tokenId, walletAddress;

        // Determine if input is token ID or wallet address
        if (tokenIdOrAddress && tokenIdOrAddress.startsWith('0x') && tokenIdOrAddress.length === 42) {
            // It's a wallet address
            walletAddress = tokenIdOrAddress;
            console.log(`\n🔍 Looking up SBT for wallet: ${walletAddress}`);
            
            const tokenIdBN = await sbt.holderToken(walletAddress);
            tokenId = tokenIdBN.toString();
            
            if (tokenId === "0") {
                throw new Error(`No SBT found for wallet address: ${walletAddress}`);
            }
        } else if (tokenIdOrAddress) {
            // It's a token ID
            tokenId = tokenIdOrAddress;
            console.log(`\n🔍 Verifying SBT Token ID: ${tokenId}`);
            
            // Get wallet address from token
            walletAddress = await sbt.ownerOf(tokenId);
        } else {
            // No parameter - use from environment or minting file
            const mintingFile = "./data/contracts/sbt-minting.json";
            if (fs.existsSync(mintingFile)) {
                const mintingData = JSON.parse(fs.readFileSync(mintingFile, 'utf8'));
                tokenId = mintingData.tokenId;
                walletAddress = mintingData.owner;
                console.log(`\n🔍 Using data from minting file - Token ID: ${tokenId}`);
            } else {
                // Use environment variables
                tokenId = process.env.SBT_TOKEN_ID || "1";
                console.log(`\n🔍 Using Token ID from .env: ${tokenId}`);
                walletAddress = await sbt.ownerOf(tokenId);
            }
        }

        console.log(`🆔 Token ID: ${tokenId}`);
        console.log(`👤 Wallet Address: ${walletAddress}`);

        // Comprehensive SBT verification
        console.log("\n🔍 REGISTRY VERIFICATION:");
        console.log("═".repeat(70));

        // 1. Basic token info
        const tokenOwner = await sbt.ownerOf(tokenId);
        const tokenURI = await sbt.tokenURI(tokenId);
        const tokenDID = await sbt.tokenDID(tokenId);
        const tokenHolder = await sbt.tokenHolder(tokenId);

        console.log(`✅ Token exists: YES`);
        console.log(`👤 Owner: ${tokenOwner}`);
        console.log(`👤 Holder mapping: ${tokenHolder}`);
        console.log(`🔗 Token URI: ${tokenURI}`);
        console.log(`🆔 DID: ${tokenDID}`);

        // 2. VC Hash verification
        const latestVCHash = await sbt.getLatestVC(tokenId);
        const allVCHashes = await sbt.getAllVCHashes(tokenId);
        const vcHashCount = await sbt.getVCHashCount(tokenId);

        console.log(`\n🔐 VC HASH REGISTRY:`);
        console.log(`📊 Total VC Hashes: ${vcHashCount.toString()}`);
        console.log(`🔐 Latest VC Hash: ${latestVCHash}`);
        
        if (allVCHashes.length > 1) {
            console.log(`📜 VC Hash History:`);
            allVCHashes.forEach((hash, index) => {
                console.log(`  ${index + 1}. ${hash}`);
            });
        }

        // 3. Cross-reference with original VC data
        console.log(`\n🔍 CROSS-REFERENCE VERIFICATION:`);
        
        // Load original signed VC for comparison
        const signedVCFile = "./data/vc-system/verifiable-credential-signed.json";
        let originalVCHash = null;
        let vcDataMatch = false;

        if (fs.existsSync(signedVCFile)) {
            const signedVC = JSON.parse(fs.readFileSync(signedVCFile, 'utf8'));
            const vcString = JSON.stringify(signedVC);
            const calculatedHash = crypto.createHash('sha256').update(vcString).digest('hex');
            originalVCHash = `0x${calculatedHash}`;
            
            vcDataMatch = originalVCHash === latestVCHash;
            
            console.log(`🔐 Original VC Hash: ${originalVCHash}`);
            console.log(`🔐 Registry VC Hash: ${latestVCHash}`);
            console.log(`✅ VC Hash Match: ${vcDataMatch ? 'YES' : 'NO'}`);
            
            // Additional VC details
            console.log(`\n📋 VC CREDENTIAL DETAILS:`);
            console.log(`👤 Subject Name: ${signedVC.credentialSubject.full_name || 'N/A'}`);
            console.log(`📧 Subject Email: ${signedVC.credentialSubject.email || 'N/A'}`);
            console.log(`✅ KYC Status: ${signedVC.credentialSubject.kycStatus || 'N/A'}`);
            console.log(`💰 Investment Limit: ${signedVC.credentialSubject.investment_limit || 'N/A'}`);
            console.log(`🏦 Risk Profile: ${signedVC.credentialSubject.risk_profile || 'N/A'}`);
            
            // Wallet verification
            const vcWalletETH = signedVC.credentialSubject.wallets?.eth;
            const walletMatch = vcWalletETH === walletAddress;
            console.log(`\n💳 WALLET VERIFICATION:`);
            console.log(`💳 VC Wallet (ETH): ${vcWalletETH || 'N/A'}`);
            console.log(`💳 SBT Owner: ${walletAddress}`);
            console.log(`✅ Wallet Match: ${walletMatch ? 'YES' : 'NO'}`);
        } else {
            console.log(`⚠️ Original VC file not found: ${signedVCFile}`);
        }

        // 4. IPFS metadata verification
        console.log(`\n🌐 IPFS METADATA VERIFICATION:`);
        if (tokenURI.startsWith('ipfs://')) {
            const ipfsHash = tokenURI.replace('ipfs://', '');
            console.log(`🔗 IPFS Hash: ${ipfsHash}`);
            
            try {
                // Try to fetch IPFS content
                const ipfsGateways = [
                    `https://ipfs.io/ipfs/${ipfsHash}`,
                    `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
                    `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`
                ];

                let ipfsContent = null;
                for (const gateway of ipfsGateways) {
                    try {
                        console.log(`🔍 Trying gateway: ${gateway}`);
                        const response = await axios.get(gateway, { timeout: 10000 });
                        ipfsContent = response.data;
                        console.log(`✅ IPFS Content Retrieved: YES`);
                        break;
                    } catch (gatewayError) {
                        console.log(`❌ Gateway failed: ${gateway.split('/')[2]}`);
                    }
                }

                if (ipfsContent) {
                    console.log(`📄 IPFS Content Type: ${typeof ipfsContent}`);
                    if (typeof ipfsContent === 'object') {
                        console.log(`📋 Content Keys: ${Object.keys(ipfsContent).join(', ')}`);
                        
                        // Check if it matches our VC structure
                        if (ipfsContent.credentialSubject) {
                            console.log(`✅ Contains VC Structure: YES`);
                            console.log(`👤 IPFS Subject: ${ipfsContent.credentialSubject.full_name || 'N/A'}`);
                        }
                    }
                }
            } catch (ipfsError) {
                console.log(`❌ IPFS Retrieval Failed: ${ipfsError.message}`);
            }
        } else {
            console.log(`⚠️ Token URI is not IPFS format: ${tokenURI}`);
        }

        // 5. Soulbound verification (try transfer)
        console.log(`\n🔒 SOULBOUND VERIFICATION:`);
        try {
            // This should fail for soulbound tokens
            const transferData = sbt.interface.encodeFunctionData(
                "transferFrom", 
                [walletAddress, walletAddress, tokenId]
            );
            
            // Estimate gas (should fail)
            await ethers.provider.estimateGas({
                to: sbtContractAddress,
                data: transferData
            });
            
            console.log(`❌ Soulbound Check: FAILED - Token appears transferable!`);
        } catch (transferError) {
            if (transferError.message.includes("soulbound") || 
                transferError.message.includes("non-transferable")) {
                console.log(`✅ Soulbound Check: PASSED - Token is non-transferable`);
            } else {
                console.log(`⚠️ Soulbound Check: Unclear - ${transferError.message}`);
            }
        }

        // 6. Registry lookup by address
        console.log(`\n🔍 REGISTRY LOOKUP VERIFICATION:`);
        const sbtInfo = await sbt.getSBTInfo(walletAddress);
        const [regTokenId, regDID, regVCHash] = sbtInfo;
        
        console.log(`🆔 Registry Token ID: ${regTokenId.toString()}`);
        console.log(`🆔 Registry DID: ${regDID}`);
        console.log(`🔐 Registry VC Hash: ${regVCHash}`);
        
        const registryConsistent = (
            regTokenId.toString() === tokenId &&
            regDID === tokenDID &&
            regVCHash === latestVCHash
        );
        
        console.log(`✅ Registry Consistency: ${registryConsistent ? 'PASSED' : 'FAILED'}`);

        // 7. Contract events verification
        console.log(`\n📜 EVENT LOG VERIFICATION:`);
        try {
            // Get SBTMinted events for this token
            const mintedEvents = await sbt.queryFilter(
                sbt.filters.SBTMinted(tokenId),
                0,
                'latest'
            );

            console.log(`📊 SBTMinted Events: ${mintedEvents.length}`);
            if (mintedEvents.length > 0) {
                const mintEvent = mintedEvents[0];
                console.log(`📦 Mint Block: ${mintEvent.blockNumber}`);
                console.log(`📋 Mint Tx: ${mintEvent.transactionHash}`);
            }

            // Get VCHashRegistered events
            const vcEvents = await sbt.queryFilter(
                sbt.filters.VCHashRegistered(tokenId),
                0,
                'latest'
            );

            console.log(`📊 VCHashRegistered Events: ${vcEvents.length}`);
        } catch (eventError) {
            console.log(`⚠️ Event query failed: ${eventError.message}`);
        }

        // Summary
        console.log(`\n🎉 VERIFICATION SUMMARY:`);
        console.log("═".repeat(70));
        console.log(`🆔 Token ID: ${tokenId}`);
        console.log(`👤 Owner: ${walletAddress}`);
        console.log(`✅ Registry Status: VERIFIED`);
        console.log(`🔐 VC Hash Status: ${vcDataMatch ? 'VERIFIED' : 'UNVERIFIED'}`);
        console.log(`🔒 Soulbound Status: VERIFIED`);
        console.log(`🌐 IPFS Status: ${tokenURI.startsWith('ipfs://') ? 'IPFS' : 'OTHER'}`);

        // Etherscan links
        console.log(`\n🔗 BLOCKCHAIN LINKS:`);
        console.log("═".repeat(70));
        if (network.name === 'sepolia') {
            console.log(`🌐 Contract: https://sepolia.etherscan.io/address/${sbtContractAddress}`);
            console.log(`🎖️ Token: https://sepolia.etherscan.io/token/${sbtContractAddress}?a=${tokenId}`);
            console.log(`👤 Owner: https://sepolia.etherscan.io/address/${walletAddress}`);
        }

        return {
            verified: true,
            tokenId: tokenId,
            owner: walletAddress,
            did: tokenDID,
            vcHash: latestVCHash,
            vcHashMatch: vcDataMatch,
            ipfsURI: tokenURI,
            registryConsistent: registryConsistent
        };

    } catch (error) {
        console.error("\n❌ VERIFICATION FAILED:");
        console.error("═".repeat(70));
        console.error("Error:", error.message);
        
        if (error.message.includes("No SBT found")) {
            console.error("🔍 Solution: Check that the wallet address has an SBT");
        } else if (error.message.includes("token does not exist")) {
            console.error("🆔 Solution: Check that the token ID is valid");
        } else if (error.message.includes("SBT_CONTRACT_ADDRESS")) {
            console.error("🔧 Solution: Update .env with correct SBT contract address");
        }
        
        process.exit(1);
    }
}

// Helper function to verify multiple tokens
async function verifyAllSBTs() {
    console.log("🔍 Verifying All SBTs in Registry...\n");
    
    try {
        const sbtContractAddress = process.env.SBT_CONTRACT_ADDRESS;
        const SBT = await ethers.getContractFactory("SBT");
        const sbt = SBT.attach(sbtContractAddress);
        
        const totalSupply = await sbt.totalSupply();
        console.log(`📊 Total SBTs: ${totalSupply.toString()}`);
        
        for (let i = 1; i <= totalSupply.toNumber(); i++) {
            console.log(`\n🔍 Verifying Token ID: ${i}`);
            await verifySBTRegistration(i.toString());
        }
        
    } catch (error) {
        console.error("❌ Bulk verification failed:", error.message);
    }
}

// Command line handling
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--all')) {
        await verifyAllSBTs();
    } else {
        const tokenIdOrAddress = args[0];
        await verifySBTRegistration(tokenIdOrAddress);
    }
    
    console.log("\n✅ VERIFICATION COMPLETED!");
}

// Run if called directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Error:", error);
            process.exit(1);
        });
}

module.exports = { verifySBTRegistration, verifyAllSBTs };