const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

async function main() {
  console.log("🚀 Deploying Simplified Multi-Chain DID Registry...\n");

  try {
    // Setup deployer using private key directly
    const provider = new hre.ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const deployer = new hre.ethers.Wallet(process.env.PHANTOM_PRIVATE_KEY, provider);
    const balance = await deployer.getBalance();
    
    console.log("👤 Deploying with account:", deployer.address);
    console.log("💰 Account balance:", hre.ethers.utils.formatEther(balance), "ETH");

    if (balance.lt(hre.ethers.utils.parseEther("0.01"))) {
      console.log("⚠️ WARNING: Low balance!");
    }

    // Compile
    console.log("\n🔨 Compiling contract...");
    await hre.run("compile");
    console.log("✅ Compiled successfully");

    // Deploy
    console.log("\n📦 Deploying SimplifiedMultiChainDIDRegistry...");
    const SimplifiedRegistry = await hre.ethers.getContractFactory("SimplifiedMultiChainDIDRegistry", deployer);
    const didRegistry = await SimplifiedRegistry.deploy();
    
    console.log("⏳ Waiting for deployment...");
    await didRegistry.deployed();
    
    console.log("✅ Contract deployed!");
    console.log("🏢 Address:", didRegistry.address);
    console.log("📄 Tx Hash:", didRegistry.deployTransaction.hash);

    // Verify deployment
    console.log("\n🔍 Verifying deployment...");
    const owner = await didRegistry.owner();
    const maxWallets = await didRegistry.MAX_WALLETS_PER_DID();
    
    console.log("👑 Owner:", owner);
    console.log("📊 Max wallets:", maxWallets.toString());

    // Check supported blockchains
    const chains = ["ETH_TEST5", "BTC_TEST", "SOL_TEST"];
    console.log("\n🔗 Supported blockchains:");
    for (const chain of chains) {
      const supported = await didRegistry.supportedBlockchains(chain);
      console.log(`   ${chain}: ${supported ? "✅" : "❌"}`);
    }

    // Update .env
    console.log("\n💾 Updating .env file...");
    let envContent = fs.readFileSync('.env', 'utf8');
    
    // Remove old contract lines
    envContent = envContent
      .split('\n')
      .filter(line => !line.startsWith('CONTRACT_ADDRESS='))
      .join('\n');
    
    // Add new contract address
    envContent += `\nCONTRACT_ADDRESS=${didRegistry.address}\n`;
    fs.writeFileSync('.env', envContent);
    
    console.log("✅ .env updated with new contract address");

    console.log("\n🎉 DEPLOYMENT COMPLETE!");
    console.log("🏢 Contract:", didRegistry.address);
    console.log("🌐 Etherscan:", `https://sepolia.etherscan.io/address/${didRegistry.address}`);
    
    console.log("\n✅ SIMPLIFIED CONTRACT FEATURES:");
    console.log("✅ Ethereum signature verification (full)");
    console.log("✅ Bitcoin wallet proofs (simplified)");
    console.log("✅ Solana wallet proofs (simplified)");
    console.log("✅ Multi-chain DID registration");
    
    console.log("\n📋 NEXT STEPS:");
    console.log("1. ✅ Simplified contract deployed");
    console.log("2. 🚀 Register DID: npx hardhat run scripts/register-did-multichain.js --network sepolia");

  } catch (error) {
    console.error("❌ Deployment failed:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });