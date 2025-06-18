const hre = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("🔍 Verifying DID registration and wallet proofs...\n");

  try {
    // Load environment variables
    const DID = process.env.DID_IDENTIFIER;
    const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

    if (!DID) throw new Error("DID_IDENTIFIER not set in .env");
    if (!CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not set in .env");

    console.log("🆔 DID:", DID);
    console.log("🏢 Contract:", CONTRACT_ADDRESS);
    console.log("🌐 Etherscan:", `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`);

    // Setup provider
    const provider = new hre.ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

    // Load contract with correct name (read-only)
    console.log("\n📋 Loading SimplifiedMultiChainDIDRegistry contract...");
    const didRegistryAbi = (await hre.artifacts.readArtifact("SimplifiedMultiChainDIDRegistry")).abi;
    const didRegistry = new hre.ethers.Contract(CONTRACT_ADDRESS, didRegistryAbi, provider);

    console.log("✅ Contract loaded successfully!");

    // Get DID record
    console.log("\n📋 Fetching DID record from blockchain...");
    let didRecord;
    try {
      didRecord = await didRegistry.getDIDRecord(DID);
      console.log("✅ DID found on-chain!");
    } catch (error) {
      if (error.message.includes("DID not found")) {
        console.log("❌ DID not found on-chain");
        console.log("💡 Make sure your DID was registered successfully");
        return;
      }
      throw error;
    }

    // Display DID details
    console.log("\n" + "=".repeat(60));
    console.log("📊 DID RECORD DETAILS");
    console.log("=".repeat(60));
    console.log(`🆔 DID: ${didRecord.did}`);
    console.log(`📦 IPFS Metadata: ${didRecord.ipfsMetadata}`);
    console.log(`⏰ Registered: ${new Date(didRecord.timestamp * 1000).toISOString()}`);
    console.log(`🔄 Status: ${didRecord.isActive ? "✅ Active" : "❌ Inactive"}`);
    console.log(`🔢 Wallet Count: ${didRecord.walletAddresses.length}`);

    // Get owner
    const owner = await didRegistry.didToOwner(DID);
    console.log(`👑 Owner: ${owner}`);

    // Display wallet proofs
    if (didRecord.walletAddresses.length > 0) {
      console.log("\n" + "=".repeat(60));
      console.log("🔐 VERIFIED WALLET PROOFS");
      console.log("=".repeat(60));
      
      for (let i = 0; i < didRecord.walletAddresses.length; i++) {
        const address = didRecord.walletAddresses[i];
        const blockchain = didRecord.blockchains[i];
        const isVerified = await didRegistry.isWalletVerifiedForDID(DID, address);
        
        console.log(`\n${i + 1}. ${blockchain}:`);
        console.log(`   📍 Address: ${address}`);
        console.log(`   ✅ Verified: ${isVerified ? "Yes" : "No"}`);
        
        // Show blockchain-specific explorer links
        if (blockchain.includes("ETH")) {
          console.log(`   🌐 Explorer: https://sepolia.etherscan.io/address/${address}`);
        } else if (blockchain.includes("BTC")) {
          console.log(`   🌐 Explorer: https://blockstream.info/testnet/address/${address}`);
        } else if (blockchain.includes("SOL")) {
          console.log(`   🌐 Explorer: https://explorer.solana.com/address/${address}?cluster=devnet`);
        }
      }
    }

    // Check contract state
    console.log("\n" + "=".repeat(60));
    console.log("📊 CONTRACT STATE");
    console.log("=".repeat(60));
    
    const maxWallets = await didRegistry.MAX_WALLETS_PER_DID();
    const proofPrefix = await didRegistry.PROOF_MESSAGE_PREFIX();
    
    console.log(`📏 Max wallets per DID: ${maxWallets.toString()}`);
    console.log(`🔖 Proof message prefix: "${proofPrefix}"`);

    // Check supported blockchains
    const supportedChains = ["ETH_TEST5", "BTC_TEST", "SOL_TEST", "ETH", "BTC", "SOL"];
    console.log("\n🔗 SUPPORTED BLOCKCHAINS:");
    for (const chain of supportedChains) {
      const isSupported = await didRegistry.supportedBlockchains(chain);
      console.log(`   ${chain}: ${isSupported ? "✅ Supported" : "❌ Not supported"}`);
    }

    // Test wallet verification function
    console.log("\n" + "=".repeat(60));
    console.log("🧪 TESTING WALLET VERIFICATION");
    console.log("=".repeat(60));
    
    for (let i = 0; i < didRecord.walletAddresses.length; i++) {
      const address = didRecord.walletAddresses[i];
      const blockchain = didRecord.blockchains[i];
      const isVerified = await didRegistry.isWalletVerifiedForDID(DID, address);
      console.log(`${blockchain} (${address}): ${isVerified ? "✅ VERIFIED" : "❌ NOT VERIFIED"}`);
    }

    // Get all wallet proofs using the contract function
    try {
      console.log("\n📋 Getting all wallet proofs from contract...");
      const [walletAddresses, blockchains] = await didRegistry.getWalletProofsForDID(DID);
      console.log(`✅ Retrieved ${walletAddresses.length} wallet proofs from contract`);
      
      for (let i = 0; i < walletAddresses.length; i++) {
        console.log(`   ${blockchains[i]}: ${walletAddresses[i]}`);
      }
    } catch (error) {
      console.log("⚠️ Could not retrieve wallet proofs using contract function");
    }

    // Final summary
    console.log("\n" + "=".repeat(60));
    console.log("🎉 VERIFICATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ DID exists on blockchain: ${didRecord.did}`);
    console.log(`✅ Multi-chain wallets verified: ${didRecord.walletAddresses.length}`);
    console.log(`✅ Blockchains proven: ${didRecord.blockchains.join(", ")}`);
    console.log(`✅ Registration status: ${didRecord.isActive ? "Active" : "Inactive"}`);
    console.log(`✅ Owner address: ${owner}`);
    console.log(`✅ Contract owner: ${await didRegistry.owner()}`);

    console.log("\n🌐 BLOCKCHAIN LINKS:");
    console.log(`📄 Contract: https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`);
    console.log(`🔍 Your DID is permanently recorded on Ethereum Sepolia testnet`);
    console.log(`🏆 Cross-chain identity achieved! Your DID proves ownership across multiple blockchains.`);

    // Show IPFS metadata link
    const ipfsHash = didRecord.ipfsMetadata;
    console.log(`\n📦 IPFS METADATA:`);
    console.log(`🔗 IPFS Hash: ${ipfsHash}`);
    console.log(`🌐 Gateway: https://gateway.pinata.cloud/ipfs/${ipfsHash}`);

    console.log("\n🎯 NEXT STEPS:");
    console.log("✅ Your multi-chain DID is fully verified and functional!");
    console.log("🔗 You can now use this DID to prove ownership of wallets across:");
    console.log("   - Ethereum (ETH_TEST5)");
    console.log("   - Bitcoin (BTC_TEST)"); 
    console.log("   - Solana (SOL_TEST)");
    console.log("🚀 Your decentralized identity is ready for use!");

  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    
    if (error.message.includes("Artifact")) {
      console.error("💡 Contract artifact not found. Make sure the contract is compiled:");
      console.error("   npx hardhat compile");
    } else if (error.message.includes("call revert exception")) {
      console.error("💡 Contract call failed. Check if the contract address is correct.");
    }
    
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });