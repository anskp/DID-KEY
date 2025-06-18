const hre = require("hardhat");
const fs = require("fs");
const { FireblocksSDK } = require("fireblocks-sdk");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

async function main() {
  console.log("🚀 Generating multi-chain wallet ownership proofs...\n");

  // Load configuration
  const DID = process.env.DID_KEY;
  const IPFS_CID = process.env.IPFS_CID;
  const VAULT_ID = process.env.VAULT_ACCOUNT_ID;

  if (!DID || !IPFS_CID || !VAULT_ID) {
    throw new Error("Missing DID_KEY, IPFS_CID, or VAULT_ACCOUNT_ID in .env");
  }

  // Initialize Fireblocks
  const fireblocks = new FireblocksSDK(
    fs.readFileSync(process.env.FIREBLOCKS_SECRET_KEY_PATH, "utf8"),
    process.env.FIREBLOCKS_API_KEY,
    process.env.FIREBLOCKS_BASE_URL
  );

  // Proof message
  const PROOF_MESSAGE_PREFIX = "DID Ownership Proof for: ";
  const MESSAGE = `${PROOF_MESSAGE_PREFIX}${DID}`;
  
  console.log("🔖 Proof message:", MESSAGE);
  console.log("🆔 DID:", DID);
  console.log("📦 IPFS Metadata:", IPFS_CID);
  console.log("🏦 Vault ID:", VAULT_ID);
  console.log("");

  // Get vault info
  console.log("🏦 Fetching vault account details...");
  const vault = await fireblocks.getVaultAccountById(VAULT_ID);
  console.log(`✅ Vault: ${vault.name} (${vault.assets?.length || 0} assets)`);
  console.log("");

  // Define wallet configurations with proper signing methods
  const walletConfigs = [
    {
      name: "Ethereum",
      assetId: "ETH_TEST5",
      blockchain: "ETH_TEST5",
      address: process.env.ETH_WALLET_ADDRESS,
      signingMethod: "TYPED_MESSAGE",
      messageType: "EIP191"
    },
    {
      name: "Bitcoin", 
      assetId: "BTC_TEST",
      blockchain: "BTC_TEST",
      address: process.env.BTC_WALLET_ADDRESS,
      signingMethod: "RAW", // Bitcoin uses RAW signing
      messageType: "BITCOIN_MESSAGE"
    },
    {
      name: "Solana",
      assetId: "SOL_TEST", 
      blockchain: "SOL_TEST",
      address: process.env.SOL_WALLET_ADDRESS,
      signingMethod: "RAW", // Solana uses RAW signing
      messageType: "SOLANA_MESSAGE"
    }
  ];

  const walletProofs = [];
  
  // Generate proof for each wallet
  for (const config of walletConfigs) {
    console.log(`🔗 Processing ${config.name} wallet...`);
    
    try {
      // Check if we have the address from .env
      if (!config.address) {
        console.log(`⚠️  ${config.name} address not found in .env, skipping...`);
        continue;
      }

      // Find asset in vault
      const asset = vault.assets?.find(a => a.id === config.assetId);
      if (!asset) {
        console.log(`⚠️  ${config.assetId} asset not found in vault, skipping...`);
        continue;
      }

      console.log(`   📍 Address: ${config.address}`);
      console.log(`   💰 Balance: ${asset.total || '0'}`);
      console.log(`   🔏 Requesting ${config.signingMethod} signature...`);

      let signTx;
      
      // Handle different signing methods for different blockchains
      if (config.signingMethod === "TYPED_MESSAGE") {
        // Ethereum EIP-191 message signing
        signTx = await fireblocks.createTransaction({
          operation: "TYPED_MESSAGE",
          assetId: config.assetId,
          source: { type: "VAULT_ACCOUNT", id: VAULT_ID },
          note: `${config.name} DID Proof – ${DID}`,
          extraParameters: {
            rawMessageData: {
              messages: [
                {
                  content: Buffer.from(MESSAGE).toString("hex"),
                  type: "EIP191"
                }
              ]
            }
          }
        });
      } else if (config.signingMethod === "RAW") {
        // Raw signing for Bitcoin and Solana
        const messageHash = crypto.createHash('sha256').update(MESSAGE).digest('hex');
        
        signTx = await fireblocks.createTransaction({
          operation: "RAW",
          assetId: config.assetId,
          source: { type: "VAULT_ACCOUNT", id: VAULT_ID },
          note: `${config.name} DID Proof – ${DID}`,
          extraParameters: {
            rawMessageData: {
              messages: [
                {
                  content: messageHash,
                  bip44addressIndex: 0,
                  bip44change: 0
                }
              ]
            }
          }
        });
      }

      console.log(`   📋 Signing transaction ID: ${signTx.id}`);
      console.log(`   ⏳ Waiting for approval in Fireblocks console...`);

      // Wait for signature completion
      let signInfo;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes
      
      while (attempts < maxAttempts) {
        signInfo = await fireblocks.getTransactionById(signTx.id);
        
        if (signInfo.status === "COMPLETED") {
          console.log(`   ✅ ${config.name} signature completed!`);
          break;
        }
        
        if (["FAILED", "REJECTED", "CANCELLED", "BLOCKED"].includes(signInfo.status)) {
          throw new Error(`Fireblocks signing failed with status ${signInfo.status}. Details: ${signInfo.subStatus || 'No additional details'}`);
        }
        
        process.stdout.write(`   ⏳ Status: ${signInfo.status} (${attempts + 1}/${maxAttempts})\r`);
        await new Promise(r => setTimeout(r, 5000));
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        throw new Error(`Signing timeout for ${config.name} wallet`);
      }

      // Extract signature based on signing method
      let fullSignature;
      
      if (config.signingMethod === "TYPED_MESSAGE") {
        // Ethereum EIP-191 signature
        const signed = signInfo.signedMessages?.[0]?.signature;
        if (!signed) {
          throw new Error(`No signature found in response for ${config.name}`);
        }
        
        const vDec = 27 + signed.v; // Add 27 to v
        const vHex = vDec.toString(16).padStart(2, "0");
        fullSignature = "0x" + signed.r + signed.s + vHex;
        
      } else if (config.signingMethod === "RAW") {
        // Raw signature for Bitcoin/Solana
        const signed = signInfo.signedMessages?.[0]?.signature;
        if (!signed) {
          throw new Error(`No signature found in response for ${config.name}`);
        }
        
        // For raw signatures, we typically get r and s values
        if (signed.fullSig) {
          fullSignature = signed.fullSig;
        } else if (signed.r && signed.s) {
          fullSignature = signed.r + signed.s;
        } else {
          fullSignature = JSON.stringify(signed); // Fallback
        }
      }

      console.log(`   🔑 Signature: ${fullSignature.substring(0, 20)}...`);

      // Create wallet proof object
      const walletProof = {
        walletAddress: config.address,
        blockchain: config.blockchain,
        signature: fullSignature,
        message: MESSAGE,
        signatureType: config.messageType,
        signingMethod: config.signingMethod,
        fireblocksTransactionId: signTx.id
      };

      walletProofs.push(walletProof);
      console.log(`   ✅ ${config.name} proof generated successfully!\n`);

    } catch (error) {
      console.error(`   ❌ Failed to generate proof for ${config.name}:`, error.message);
      console.log(`   🔄 Continuing with other wallets...\n`);
      
      // Try alternative signing method for failed blockchains
      if (config.signingMethod === "RAW" && error.message.includes("400")) {
        console.log(`   🔄 Trying alternative signing method for ${config.name}...`);
        try {
          // Alternative: Try simple message signing
          const altSignTx = await fireblocks.createTransaction({
            operation: "TYPED_MESSAGE",
            assetId: config.assetId,
            source: { type: "VAULT_ACCOUNT", id: VAULT_ID },
            note: `${config.name} DID Proof (Alt) – ${DID}`,
            extraParameters: {
              rawMessageData: {
                messages: [
                  {
                    content: Buffer.from(MESSAGE).toString("hex"),
                    type: config.messageType
                  }
                ]
              }
            }
          });
          
          console.log(`   📋 Alternative signing transaction ID: ${altSignTx.id}`);
          console.log(`   ⏳ Waiting for alternative signature...`);
          
          // Wait for alternative signature
          let altSignInfo;
          let altAttempts = 0;
          
          while (altAttempts < 30) { // Shorter timeout for alternative
            altSignInfo = await fireblocks.getTransactionById(altSignTx.id);
            
            if (altSignInfo.status === "COMPLETED") {
              console.log(`   ✅ ${config.name} alternative signature completed!`);
              
              const altSigned = altSignInfo.signedMessages?.[0]?.signature;
              if (altSigned) {
                let altFullSignature;
                if (altSigned.fullSig) {
                  altFullSignature = altSigned.fullSig;
                } else if (altSigned.r && altSigned.s) {
                  altFullSignature = altSigned.r + altSigned.s;
                } else {
                  altFullSignature = JSON.stringify(altSigned);
                }
                
                const altWalletProof = {
                  walletAddress: config.address,
                  blockchain: config.blockchain,
                  signature: altFullSignature,
                  message: MESSAGE,
                  signatureType: config.messageType,
                  signingMethod: "TYPED_MESSAGE_ALT",
                  fireblocksTransactionId: altSignTx.id
                };
                
                walletProofs.push(altWalletProof);
                console.log(`   ✅ ${config.name} alternative proof generated successfully!\n`);
                break;
              }
            }
            
            if (["FAILED", "REJECTED", "CANCELLED", "BLOCKED"].includes(altSignInfo.status)) {
              console.log(`   ⚠️  Alternative signing also failed for ${config.name}`);
              break;
            }
            
            await new Promise(r => setTimeout(r, 3000));
            altAttempts++;
          }
          
        } catch (altError) {
          console.log(`   ⚠️  Alternative signing failed for ${config.name}:`, altError.message);
        }
      }
    }
  }

  // Validate we have at least one proof
  if (walletProofs.length === 0) {
    throw new Error("❌ No wallet proofs generated! Check your Fireblocks setup and .env addresses.");
  }

  console.log(`🎉 Generated ${walletProofs.length} wallet proofs successfully!`);
  
  // Display summary
  console.log("\n📋 WALLET PROOF SUMMARY:");
  walletProofs.forEach((proof, index) => {
    console.log(`${index + 1}. ${proof.blockchain}:`);
    console.log(`   Address: ${proof.walletAddress}`);
    console.log(`   Signature: ${proof.signature.substring(0, 30)}...`);
    console.log(`   Type: ${proof.signatureType}`);
    console.log(`   Method: ${proof.signingMethod}`);
  });
  console.log("");

  // Save proofs to file
  const proofsData = {
    did: DID,
    ipfsMetadata: IPFS_CID,
    message: MESSAGE,
    walletProofs: walletProofs,
    generatedAt: new Date().toISOString(),
    vaultId: VAULT_ID
  };

  const proofsFile = `../data/did-system/wallet-proofs-${Date.now()}.json`;
  fs.writeFileSync(proofsFile, JSON.stringify(proofsData, null, 2));
  console.log(`💾 Wallet proofs saved to: ${proofsFile}`);

  // Prepare smart contract call data
  console.log("\n🔧 Preparing smart contract registration data...");
  
  // Format proofs for Solidity contract
  const contractProofs = walletProofs.map(proof => ({
    walletAddress: proof.walletAddress,
    blockchain: proof.blockchain,
    signature: proof.signature,
    message: proof.message
  }));

  // Save contract call data
  const contractData = {
    did: DID,
    ipfsMetadata: IPFS_CID,
    walletProofs: contractProofs
  };

  const contractFile = `../data/did-system/contract-call-data-${Date.now()}.json`;
  fs.writeFileSync(contractFile, JSON.stringify(contractData, null, 2));
  console.log(`📄 Contract call data saved to: ${contractFile}`);

  // Update .env with proof status
  const envContent = fs.readFileSync('.env', 'utf8');
  const newEnvLines = [
    '',
    '# Multi-Chain Wallet Proofs Generated',
    `WALLET_PROOFS_COUNT=${walletProofs.length}`,
    `WALLET_PROOFS_GENERATED_AT=${new Date().toISOString()}`,
    `PROOFS_FILE=${proofsFile}`,
    `CONTRACT_DATA_FILE=${contractFile}`
  ];
  
  const updatedEnv = envContent + newEnvLines.join('\n') + '\n';
  fs.writeFileSync('.env', updatedEnv);

  console.log("\n🎉 MULTI-CHAIN PROOF GENERATION COMPLETED!");
  console.log("📊 Summary:");
  console.log(`   ✅ Total wallets proven: ${walletProofs.length}`);
  console.log(`   🔗 Blockchains: ${walletProofs.map(p => p.blockchain).join(', ')}`);
  console.log(`   💾 Proofs saved to: ${proofsFile}`);
  console.log(`   📄 Contract data: ${contractFile}`);
  
  console.log("\n📋 NEXT STEPS:");
  console.log("1. ✅ Multi-chain wallet proofs generated");
  console.log("2. 🚀 Run DID registration script with all proofs");
  console.log("3. 🔍 Verify on-chain registration");
  console.log("4. 🎯 Your DID will be bound to ALL proven wallets!");

  console.log(`\n🔥 Ready to register DID with ${walletProofs.length} wallet proofs!`);
  
  if (walletProofs.length >= 2) {
    console.log("🏆 CROSS-CHAIN IDENTITY ACHIEVED! Multiple blockchains proven!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Multi-chain proof generation failed:", error.message);
    process.exit(1);
  });