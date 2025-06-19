const { ethers } = require("hardhat");
const { formatEther, formatUnits, parseEther } = require("ethers");
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

async function mintSBTWithVC() {
    console.log("🎖️ Minting SBT (Soulbound Token) with Verifiable Credential...\n");

    try {
        // Get signer
        const [signer] = await ethers.getSigners();
        console.log("👤 Minting with account:", signer.address);
        
        // Check balance
        const balance = await ethers.provider.getBalance(signer.address);
        console.log("�� Account balance:", formatEther(balance), "ETH");

        // Get network info
        const network = await ethers.provider.getNetwork();
        console.log(`🌐 Network: ${network.name} (chainId: ${network.chainId})`);

        // Load SBT contract address from .env
        const sbtContractAddress = process.env.SBT_CONTRACT_ADDRESS;
        if (!sbtContractAddress) {
            throw new Error("SBT_CONTRACT_ADDRESS not found in .env file. Run deploy-sbt-contract.js first.");
        }

        console.log(`📄 SBT Contract: ${sbtContractAddress}`);

        // Load VC data
        const vcMetadataFile = "./data/vc-system/vc-metadata.json";
        if (!fs.existsSync(vcMetadataFile)) {
            throw new Error("VC metadata not found! Complete previous steps first.");
        }

        const vcMetadata = JSON.parse(fs.readFileSync(vcMetadataFile, 'utf8'));
        console.log("📋 Loaded VC metadata from:", vcMetadataFile);

        // Load signed VC for hash calculation
        const signedVCFile = "./data/vc-system/verifiable-credential-signed.json";
        if (!fs.existsSync(signedVCFile)) {
            throw new Error("Signed VC not found! Run sign-verifiable-credential.js first.");
        }

        const signedVC = JSON.parse(fs.readFileSync(signedVCFile, 'utf8'));
        console.log("📄 Loaded signed VC from:", signedVCFile);

        // Get required data from environment and VC
        const investorDID = process.env.DID_KEY || signedVC.credentialSubject.id;
        const investorETHWallet = process.env.ETH_WALLET_ADDRESS || signedVC.credentialSubject.wallets.eth;
        const vcIPFSUri = process.env.VC_IPFS_URI || vcMetadata.vcIPFSUri;

        if (!investorDID || !investorETHWallet || !vcIPFSUri) {
            throw new Error("Missing required data: DID, ETH wallet, or VC IPFS URI");
        }

        // Calculate VC hash for on-chain storage
        const vcString = JSON.stringify(signedVC);
        const vcHash = crypto.createHash('sha256').update(vcString).digest('hex');
        const vcHashBytes32 = `0x${vcHash}`;

        console.log("\n📋 MINTING PARAMETERS:");
        console.log("═".repeat(70));
        console.log(`🎯 Recipient: ${investorETHWallet}`);
        console.log(`🆔 DID: ${investorDID}`);
        console.log(`🔗 Token URI: ${vcIPFSUri}`);
        console.log(`🔐 VC Hash: ${vcHashBytes32}`);
        console.log(`👤 Investor: ${signedVC.credentialSubject.full_name}`);
        console.log(`✅ KYC Status: ${signedVC.credentialSubject.kycStatus}`);

        // Connect to SBT contract
        console.log("\n🔗 Connecting to SBT contract...");
        const SBT = await ethers.getContractFactory("SBT");
        const sbt = SBT.attach(sbtContractAddress);

        // Verify contract connection
        const contractName = await sbt.name();
        const contractSymbol = await sbt.symbol();
        const contractOwner = await sbt.owner();
        
        console.log(`📋 Contract Name: ${contractName}`);
        console.log(`🎯 Contract Symbol: ${contractSymbol}`);
        console.log(`👑 Contract Owner: ${contractOwner}`);

        // Check if recipient already has an SBT
        console.log("\n🔍 Checking if recipient already has SBT...");
        const existingTokenId = await sbt.holderToken(investorETHWallet);
        if (existingTokenId.toString() !== "0") {
            console.log(`⚠️ Address ${investorETHWallet} already has SBT with token ID: ${existingTokenId.toString()}`);
            
            // Option to register new VC hash instead of minting
            console.log("🔄 Registering new VC hash for existing SBT...");
            const registerTx = await sbt.registerVC(existingTokenId, vcHashBytes32);
            console.log(`⏳ Transaction submitted: ${registerTx.hash}`);
            
            const registerReceipt = await registerTx.wait();
            console.log(`✅ VC hash registered! Gas used: ${registerReceipt.gasUsed.toString()}`);
            
            return {
                action: "vc_updated",
                tokenId: existingTokenId.toString(),
                transactionHash: registerTx.hash,
                vcHash: vcHashBytes32
            };
        }

        // Estimate gas for minting
        console.log("⛽ Estimating gas for minting...");
        try {
            const gasEstimate = await sbt.estimateGas.mintSBT(
                investorETHWallet,
                investorDID,
                vcIPFSUri,
                vcHashBytes32
            );
            const gasPrice = await ethers.provider.getGasPrice();
            const estimatedCost = gasEstimate * gasPrice;
            
            console.log(`📊 Estimated Gas: ${gasEstimate.toString()}`);
            console.log(`💰 Gas Price: ${formatUnits(gasPrice, 'gwei')} gwei`);
            console.log(`💸 Estimated Cost: ${formatEther(estimatedCost)} ETH`);
        } catch (gasError) {
            console.log("⚠️ Gas estimation failed, proceeding with minting...");
        }

        // Mint the SBT
        console.log("\n🎖️ Minting SBT with VC data...");
        console.log("⏳ Transaction in progress...");
        
        const mintTx = await sbt.mintSBT(
            investorETHWallet,
            investorDID,
            vcIPFSUri,
            vcHashBytes32
        );

        console.log(`📋 Transaction Hash: ${mintTx.hash}`);
        console.log("⏳ Waiting for confirmation...");

        // Add timeout to prevent hanging indefinitely
        let mintReceipt;
        try {
            const txPromise = mintTx.wait();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Transaction confirmation timeout after 120 seconds")), 120000)
            );
            
            mintReceipt = await Promise.race([txPromise, timeoutPromise]);
            console.log("✅ Transaction confirmed!");
        } catch (error) {
            console.log("⚠️ Transaction confirmation timed out or failed:", error.message);
            console.log("⚠️ The transaction might still be processed. Check Etherscan with the transaction hash.");
            console.log(`🔍 Etherscan: https://sepolia.etherscan.io/tx/${mintTx.hash}`);
            
            // Save partial minting info
            const partialMintingInfo = {
                transactionHash: mintTx.hash,
                recipient: investorETHWallet,
                did: investorDID,
                vcHash: vcHashBytes32,
                contractAddress: sbtContractAddress,
                mintedAt: new Date().toISOString(),
                status: "pending_confirmation"
            };
            
            // Save partial minting data
            const partialMintingFile = "./data/contracts/sbt-minting-pending.json";
            fs.writeFileSync(partialMintingFile, JSON.stringify(partialMintingInfo, null, 2));
            console.log(`📄 Partial minting info saved to: ${partialMintingFile}`);
            console.log("🔄 Run this script again later to check if the transaction was confirmed.");
            
            // Update .env with transaction hash
            let envContent = fs.readFileSync('.env', 'utf8');
            envContent += `\nSBT_PENDING_TX=${mintTx.hash}\n`;
            fs.writeFileSync('.env', envContent);
            
            process.exit(0);
        }
        
        console.log("\n✅ SBT MINTED SUCCESSFULLY!");
        console.log("═".repeat(70));
        console.log(`🎖️ Transaction Hash: ${mintTx.hash}`);
        console.log(`⛽ Gas Used: ${mintReceipt.gasUsed.toString()}`);
        console.log(`📦 Block Number: ${mintReceipt.blockNumber}`);

        // Get the minted token ID from events
        let tokenId = null;
        for (const log of mintReceipt.logs) {
            try {
                const parsedLog = sbt.interface.parseLog(log);
                if (parsedLog.name === 'SBTMinted') {
                    tokenId = parsedLog.args.tokenId.toString();
                    break;
                }
            } catch (error) {
                // Skip unparseable logs
            }
        }

        if (!tokenId) {
            // Fallback: get total supply to determine token ID
            const totalSupply = await sbt.totalSupply();
            tokenId = totalSupply.toString();
        }

        console.log(`🆔 Token ID: ${tokenId}`);

        // Verify the minted SBT
        console.log("\n🔍 Verifying minted SBT...");
        const tokenOwner = await sbt.ownerOf(tokenId);
        const tokenURI = await sbt.tokenURI(tokenId);
        const tokenDID = await sbt.tokenDID(tokenId);
        const latestVCHash = await sbt.getLatestVC(tokenId);

        console.log("\n📋 SBT VERIFICATION:");
        console.log("═".repeat(70));
        console.log(`🆔 Token ID: ${tokenId}`);
        console.log(`👤 Owner: ${tokenOwner}`);
        console.log(`🔗 Token URI: ${tokenURI}`);
        console.log(`🆔 DID: ${tokenDID}`);
        console.log(`🔐 VC Hash: ${latestVCHash}`);
        console.log(`✅ Soulbound: Yes (non-transferable)`);

        // Verify VC hash matches
        const hashMatches = latestVCHash === vcHashBytes32;
        console.log(`🔍 VC Hash Match: ${hashMatches ? '✅ YES' : '❌ NO'}`);

        // Save minting info
        const mintingInfo = {
            tokenId: tokenId,
            owner: tokenOwner,
            did: tokenDID,
            tokenURI: tokenURI,
            vcHash: latestVCHash,
            transactionHash: mintTx.hash,
            blockNumber: mintReceipt.blockNumber,
            gasUsed: mintReceipt.gasUsed.toString(),
            contractAddress: sbtContractAddress,
            mintedAt: new Date().toISOString(),
            network: network.name,
            chainId: network.chainId.toString(),
            credentialSubject: {
                name: signedVC.credentialSubject.full_name,
                email: signedVC.credentialSubject.email,
                kycStatus: signedVC.credentialSubject.kycStatus,
                wallets: signedVC.credentialSubject.wallets
            }
        };

        // Save minting data
        const mintingFile = "./data/contracts/sbt-minting.json";
        fs.writeFileSync(mintingFile, JSON.stringify(mintingInfo, null, 2));

        // Update .env with minting info
        let envContent = fs.readFileSync('.env', 'utf8');
        
        // Remove old minting entries if they exist
        envContent = envContent
            .split('\n')
            .filter(line => 
                !line.startsWith('SBT_TOKEN_ID=') &&
                !line.startsWith('SBT_MINTING_TX=') &&
                !line.startsWith('SBT_MINTED_AT=')
            )
            .join('\n');

        // Add new minting entries
        const newEnvVars = `
# SBT Minting (Step 5)
SBT_TOKEN_ID=${tokenId}
SBT_MINTING_TX=${mintTx.hash}
SBT_MINTED_AT=${new Date().toISOString()}
`;

        envContent += newEnvVars;
        fs.writeFileSync('.env', envContent);

        console.log("\n🔗 BLOCKCHAIN VERIFICATION:");
        console.log("═".repeat(70));
        if (network.name === 'sepolia' || network.chainId === 11155111n) {
            console.log(`🌐 Contract: https://sepolia.etherscan.io/address/${sbtContractAddress}`);
            console.log(`📋 Transaction: https://sepolia.etherscan.io/tx/${mintTx.hash}`);
            console.log(`🎖️ Token: https://sepolia.etherscan.io/token/${sbtContractAddress}?a=${tokenId}`);
        } else {
            console.log(`🌐 Explorer: Check your network's explorer for ${sbtContractAddress}`);
        }

        console.log("\n🎉 COMPLETE WORKFLOW SUMMARY:");
        console.log("═".repeat(70));
        console.log("1. ✅ VC JSON created with investor data");
        console.log("2. ✅ VC signed with Ed25519 cryptographic proof");
        console.log("3. ✅ VC uploaded to IPFS for decentralized storage");
        console.log("4. ✅ SBT contract deployed with VC hash registry");
        console.log("5. ✅ SBT minted and bound to investor wallet");

        console.log("\n🔮 FUTURE CAPABILITIES:");
        console.log("═".repeat(70));
        console.log("🔄 Update KYC: Call registerVC() to add new VC hashes");
        console.log("📦 Update Metadata: Call updateTokenURI() for new IPFS data");
        console.log("🔍 Verify Credentials: Query VC hashes and validate against IPFS");
        console.log("🧬 ZK Proofs: Use VC hashes as anchors for zero-knowledge circuits");
        console.log("🏦 Multi-Chain: Expand to other blockchains with same DID");

        console.log("\n💾 FILES CREATED:");
        console.log("═".repeat(70));
        console.log(`📄 ${mintingFile}`);
        console.log(`🔧 .env (updated with SBT token info)`);

        return {
            action: "sbt_minted",
            tokenId: tokenId,
            owner: tokenOwner,
            transactionHash: mintTx.hash,
            contractAddress: sbtContractAddress,
            vcHash: vcHashBytes32,
            mintingInfo: mintingInfo
        };

    } catch (error) {
        console.error("\n❌ SBT MINTING FAILED:");
        console.error("═".repeat(70));
        console.error("Error:", error.message);
        
        // Specific error handling
        if (error.message.includes("already has SBT")) {
            console.error("🔄 Solution: Use registerVC() to update existing SBT instead");
        } else if (error.code === 'INSUFFICIENT_FUNDS') {
            console.error("💰 Solution: Add more ETH to your wallet");
        } else if (error.message.includes("VC hash cannot be empty")) {
            console.error("🔐 Solution: Check that VC was properly signed and hashed");
        } else if (error.message.includes("cannot mint to zero address")) {
            console.error("👤 Solution: Check that ETH wallet address is valid");
        }
        
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    mintSBTWithVC()
        .then(() => {
            console.log("\n🎉 SBT MINTING COMPLETED!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("❌ Error:", error);
            process.exit(1);
        });
}

module.exports = { mintSBTWithVC };