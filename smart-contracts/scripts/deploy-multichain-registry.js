const hre = require("hardhat");
const fs = require("fs");
require("dotenv").config();

async function main() {
  console.log("🚀 Deploying Multi-Chain DID Registry with Phantom Wallet...\n");

  try {
    // Step 1: Get deployment account info
    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL not set in .env");
    const provider = new hre.ethers.providers.JsonRpcProvider(rpcUrl);
    if (!process.env.DEPLOYMENT_PRIVATE_KEY) {
      throw new Error("DEPLOYMENT_PRIVATE_KEY missing in .env");
    }
    const deployer = new hre.ethers.Wallet(process.env.DEPLOYMENT_PRIVATE_KEY, provider);
    const deployerAddress = deployer.address;
    const balance = await deployer.getBalance();
    
    console.log("👤 Deploying with account:", deployerAddress);
    console.log("💰 Account balance:", hre.ethers.utils.formatEther(balance), "ETH");
    console.log("🎯 Target Fireblocks owner:", process.env.ETH_WALLET_ADDRESS);
    
    if (balance.lt(hre.ethers.utils.parseEther("0.01"))) {
      console.log("⚠️  WARNING: Low balance! You might need more ETH for gas fees");
    }
    console.log("");

    // Step 2: Compile contract
    console.log("🔨 Compiling MultiChainDIDRegistry contract...");
    await hre.run("compile");
    console.log("✅ Contract compiled successfully\n");

    // Step 3: Deploy contract
    console.log("📦 Deploying MultiChainDIDRegistry contract...");
    console.log("🔗 Supporting multi-chain wallet proofs (ETH, BTC, SOL)");
    
    const MultiChainDIDRegistry = await hre.ethers.getContractFactory("MultiChainDIDRegistry", deployer);
    
    // Deploy contract
    const didRegistry = await MultiChainDIDRegistry.deploy();
    
    console.log("⏳ Waiting for deployment transaction to be mined...");
    await didRegistry.deployed();
    
    console.log("✅ Contract deployed successfully!");
    console.log("🏢 Contract address:", didRegistry.address);
    console.log("📄 Deployment tx:", didRegistry.deployTransaction.hash);
    console.log("");

    // Step 4: Transfer ownership to Fireblocks wallet (if specified)
    if (process.env.ETH_WALLET_ADDRESS) {
      console.log("👑 Transferring ownership to Fireblocks wallet...");
      const transferTx = await didRegistry.transferOwnership(process.env.ETH_WALLET_ADDRESS);
      await transferTx.wait();
      
      console.log("✅ Ownership transferred successfully!");
      console.log("📄 Transfer tx:", transferTx.hash);
      console.log("");
    }

    // Step 5: Verify contract state
    console.log("🔍 Verifying contract deployment...");
    const contractOwner = await didRegistry.owner();
    const maxWallets = await didRegistry.MAX_WALLETS_PER_DID();
    const proofPrefix = await didRegistry.PROOF_MESSAGE_PREFIX();
    
    console.log("👑 Contract owner:", contractOwner);
    console.log("📊 Max wallets per DID:", maxWallets.toString());
    console.log("🔖 Proof message prefix:", proofPrefix);
    
    // Check supported blockchains
    const supportedChains = ["ETH_TEST5", "BTC_TEST", "SOL_TEST", "ETH", "BTC", "SOL"];
    console.log("🔗 Supported blockchains:");
    for (const chain of supportedChains) {
      const isSupported = await didRegistry.supportedBlockchains(chain);
      console.log(`   ${chain}: ${isSupported ? "✅ Supported" : "❌ Not supported"}`);
    }
    console.log("");

    // Step 6: Get deployment receipt and gas info
    const deploymentReceipt = await provider.getTransactionReceipt(didRegistry.deployTransaction.hash);
    const transferReceipt = process.env.ETH_WALLET_ADDRESS ? 
      await provider.getTransactionReceipt((await didRegistry.transferOwnership(process.env.ETH_WALLET_ADDRESS)).hash) : 
      null;
    
    const totalGasUsed = transferReceipt ? 
      deploymentReceipt.gasUsed.add(transferReceipt.gasUsed) : 
      deploymentReceipt.gasUsed;

    const txData = didRegistry.deployTransaction;
    const effectiveGasPrice = txData.gasPrice || txData.maxFeePerGas;
    const totalCost = effectiveGasPrice ? totalGasUsed.mul(effectiveGasPrice) : hre.ethers.constants.Zero;
    
    console.log("⛽ Gas Summary:");
    console.log("   Deployment gas used:", deploymentReceipt.gasUsed.toString());
    if (transferReceipt) {
      console.log("   Transfer gas used:", transferReceipt.gasUsed.toString());
    }
    console.log("   Total gas used:", totalGasUsed.toString());
    console.log("   Gas price:", hre.ethers.utils.formatUnits(effectiveGasPrice, 'gwei'), "gwei");
    console.log("   Total cost:", hre.ethers.utils.formatEther(totalCost), "ETH");
    console.log("");

    // Step 7: Save deployment info
    const deploymentInfo = {
      contractAddress: didRegistry.address,
      contractName: "MultiChainDIDRegistry",
      deployerAddress: deployerAddress,
      contractOwner: contractOwner,
      deploymentTxHash: didRegistry.deployTransaction.hash,
      ownershipTransferTxHash: transferReceipt?.transactionHash || null,
      network: "sepolia",
      chainId: 11155111,
      deployedAt: new Date().toISOString(),
      gasUsed: {
        deployment: deploymentReceipt.gasUsed.toString(),
        ownership: transferReceipt?.gasUsed.toString() || "0",
        total: totalGasUsed.toString()
      },
      gasPrice: effectiveGasPrice ? effectiveGasPrice.toString() : "0",
      totalCost: hre.ethers.utils.formatEther(totalCost),
      supportedBlockchains: ["ETH_TEST5", "BTC_TEST", "SOL_TEST"],
      features: [
        "Multi-chain wallet proofs",
        "Ethereum signature verification",
        "Bitcoin address support",
        "Solana address support",
        "IPFS metadata storage"
      ]
    };

    // Save to file
    const deploymentFile = `../data/did-system/multichain-contract-deployment-${Date.now()}.json`;
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log("💾 Deployment info saved to:", deploymentFile);

    // Update .env with new contract address
    const envContent = fs.readFileSync('.env', 'utf8');
    
    // Remove old contract info
    const cleanedEnv = envContent
      .split('\n')
      .filter(line => !line.startsWith('CONTRACT_ADDRESS=') && 
                     !line.startsWith('DEPLOYMENT_TX=') && 
                     !line.startsWith('OWNERSHIP_TRANSFER_TX=') && 
                     !line.startsWith('CONTRACT_DEPLOYED_AT='))
      .join('\n');
    
    const newEnvLines = [
      '',
      '# Multi-Chain Contract Deployment Info',
      `CONTRACT_ADDRESS=${didRegistry.address}`,
      `CONTRACT_NAME=MultiChainDIDRegistry`,
      `DEPLOYMENT_TX=${didRegistry.deployTransaction.hash}`,
      `OWNERSHIP_TRANSFER_TX=${transferReceipt?.transactionHash || ""}`,
      `CONTRACT_DEPLOYED_AT=${new Date().toISOString()}`,
      `MULTICHAIN_SUPPORT=true`
    ];
    
    const updatedEnv = cleanedEnv + newEnvLines.join('\n') + '\n';
    fs.writeFileSync('.env', updatedEnv);
    console.log("📝 Contract info updated in .env file");

    // Step 8: Display next steps
    console.log("\n🎉 Multi-Chain DID Registry deployment completed successfully!");
    console.log("🔗 Network: Ethereum Sepolia Testnet");
    console.log("🏢 Contract:", didRegistry.address);
    console.log("🌐 Etherscan:", `https://sepolia.etherscan.io/address/${didRegistry.address}`);
    console.log("👑 Owner:", contractOwner);
    
    console.log("\n🔗 MULTI-CHAIN FEATURES:");
    console.log("✅ Ethereum wallet proofs (ETH_TEST5)");
    console.log("✅ Bitcoin wallet proofs (BTC_TEST)");
    console.log("✅ Solana wallet proofs (SOL_TEST)");
    console.log("✅ String-based wallet addresses");
    console.log("✅ Blockchain-specific validation");
    
    console.log("\n📋 NEXT STEPS:");
    console.log("1. ✅ Multi-chain contract deployed");
    console.log("2. 🔄 Your wallet proofs are already generated");
    console.log("3. 📝 Register your DID with multi-chain wallet proofs");
    console.log("4. 🔍 Verify on-chain registration");
    console.log("5. 🚀 Run: npx hardhat run scripts/register-did-multichain.js --network sepolia");
    
  } catch (error) {
    console.error("❌ Deployment failed:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });