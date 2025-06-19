import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
dotenv.config();

async function createVerifiableCredential() {
  console.log("🎯 Creating Verifiable Credential for investor...\n");

  try {
    // Load investor data from environment
    const investorDID = process.env.DID_IDENTIFIER || process.env.DID_KEY || process.env.DID;
    const ethWallet = process.env.ETH_WALLET_ADDRESS;
    const btcWallet = process.env.BTC_WALLET_ADDRESS;
    const solWallet = process.env.SOL_WALLET_ADDRESS;
    const walletMetaCID = process.env.IPFS_CID;
    const sbtImageCID = process.env.IMAGE1_CID || process.env.SBT_IMAGE_CID;
    
    if (!investorDID || !ethWallet || !btcWallet || !solWallet || !walletMetaCID) {
      throw new Error("Missing required investor data in .env file. Ensure DID_KEY, ETH_WALLET_ADDRESS, BTC_WALLET_ADDRESS, SOL_WALLET_ADDRESS, and IPFS_CID are set.");
    }

    console.log("📋 Investor Information:");
    console.log(`🆔 DID: ${investorDID}`);
    console.log(`💎 ETH Wallet: ${ethWallet}`);
    console.log(`₿ BTC Wallet: ${btcWallet}`);
    console.log(`☀️ SOL Wallet: ${solWallet}`);
    console.log(`📦 Wallet Metadata: ipfs://${walletMetaCID}`);

    // Generate issuer DID (for this demo, we'll create a simple one)
    const issuerDID = "did:key:z6MkqLxjCSeSxfT1Uy9WGSTyh2d4Qm7ZGeUmY3BGoxE78ZMd"; // Same as investor for demo
    
    // Get current timestamp
    const now = new Date();
    const issuanceDate = now.toISOString();
    const expirationDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year

    // Create the Verifiable Credential
    const verifiableCredential = {
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1"
      ],
      "type": ["VerifiableCredential", "KYCVerifiedCredential"],
      "issuer": issuerDID,
      "issuanceDate": issuanceDate,
      "expirationDate": expirationDate,
      "credentialSubject": {
        "id": investorDID,
        
        // Multi-chain wallet addresses
        "wallets": {
          "eth": ethWallet,
          "btc": btcWallet,
          "sol": solWallet
        },
        "walletMetadata": `ipfs://${walletMetaCID}`,
        
        // KYC Information
        "kycStatus": "approved",
        "kycLevel": "basic",
        "applicant_id": "test-investor-001",
        "first_name": "Anas",
        "last_name": "KP", 
        "full_name": "Anas KP",
        "gender": "male",
        "date_of_birth": "2000-01-01",
        "phone": "+91-9876543210",
        "email": "anas@example.com",
        "country": "IN",
        "lang": "en",
        "level_name": "Basic Verification",
        "postcode": "682001",
        "review_answer": "GREEN",
        "review_status": "completed",
        
        // Additional metadata
        "verification_timestamp": issuanceDate,
        "blockchain_proofs": {
          "ethereum": {
            "network": "sepolia",
            "address": ethWallet,
            "verified": true
          },
          "bitcoin": {
            "network": "testnet",
            "address": btcWallet,
            "verified": true
          },
          "solana": {
            "network": "devnet", 
            "address": solWallet,
            "verified": true
          }
        }
      },
      
      // SBT Image (will be the badge/NFT image)
      "image": sbtImageCID ? `ipfs://${sbtImageCID}` : "ipfs://bafkreiaowluolqmetn5mazzyvu72a6y6wmfyoiwiynuzfcfxogemcdknya", // Uses IMAGE1_CID if provided
      
      // Proof section (will be filled after signing)
      "proof": {
        "type": "Ed25519Signature2020",
        "created": issuanceDate,
        "verificationMethod": `${issuerDID}#${issuerDID.split(':').pop()}`,
        "proofPurpose": "assertionMethod",
        "jws": "PLACEHOLDER_FOR_SIGNATURE" // Will be replaced with actual signature
      }
    };

    // Create data directory if it doesn't exist
    const dataDir = "./data/vc-system";
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Save unsigned VC
    const vcFileName = `${dataDir}/verifiable-credential-unsigned.json`;
    fs.writeFileSync(vcFileName, JSON.stringify(verifiableCredential, null, 2));

    // Calculate VC hash (for on-chain storage)
    const vcString = JSON.stringify(verifiableCredential);
    const vcHash = crypto.createHash('sha256').update(vcString).digest('hex');
    const vcHashWithPrefix = `0x${vcHash}`;

    console.log("\n✅ VERIFIABLE CREDENTIAL CREATED!");
    console.log("═".repeat(60));
    console.log(`📄 VC File: ${vcFileName}`);
    console.log(`📋 VC Type: KYCVerifiedCredential`);
    console.log(`🆔 Subject: ${investorDID}`);
    console.log(`👤 Issuer: ${issuerDID}`);
    console.log(`⏰ Valid from: ${issuanceDate}`);
    console.log(`⏰ Valid until: ${expirationDate}`);
    console.log(`🔐 VC Hash: ${vcHashWithPrefix}`);

    console.log("\n🔐 CREDENTIAL SUBJECT SUMMARY:");
    console.log("═".repeat(60));
    console.log(`👤 Name: ${verifiableCredential.credentialSubject.full_name}`);
    console.log(`📧 Email: ${verifiableCredential.credentialSubject.email}`);
    console.log(`🏳️ Country: ${verifiableCredential.credentialSubject.country}`);
    console.log(`✅ KYC Status: ${verifiableCredential.credentialSubject.kycStatus}`);
    console.log(`🎯 KYC Level: ${verifiableCredential.credentialSubject.kycLevel}`);

    console.log("\n🔗 MULTI-CHAIN WALLETS:");
    console.log("═".repeat(60));
    console.log(`💎 Ethereum: ${verifiableCredential.credentialSubject.wallets.eth}`);
    console.log(`₿ Bitcoin: ${verifiableCredential.credentialSubject.wallets.btc}`);
    console.log(`☀️ Solana: ${verifiableCredential.credentialSubject.wallets.sol}`);

    // Save metadata for next steps
    const metadata = {
      vcHash: vcHashWithPrefix,
      vcFile: vcFileName,
      issuer: issuerDID,
      subject: investorDID,
      issuanceDate: issuanceDate,
      expirationDate: expirationDate,
      kycStatus: "approved",
      wallets: verifiableCredential.credentialSubject.wallets,
      createdAt: now.toISOString()
    };

    const metadataFile = `${dataDir}/vc-metadata.json`;
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

    console.log("\n📋 NEXT STEPS:");
    console.log("═".repeat(60));
    console.log("1. ✅ VC JSON created (unsigned)");
    console.log("2. 🔏 Sign VC using DIDKit");
    console.log("3. 📦 Upload signed VC to IPFS");
    console.log("4. 🏗️ Deploy SBT smart contract");
    console.log("5. 🎖️ Mint SBT with VC data");

    console.log("\n🚀 Ready for Step 2: VC Signing!");
    console.log(`💾 VC saved to: ${vcFileName}`);
    console.log(`📊 Metadata saved to: ${metadataFile}`);

    return {
      vc: verifiableCredential,
      vcHash: vcHashWithPrefix,
      metadata: metadata
    };

  } catch (error) {
    console.error("❌ VC creation failed:", error.message);
    process.exit(1);
  }
}

// Run the script
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  createVerifiableCredential()
    .then(() => {
      console.log("\n🎉 VC CREATION COMPLETED!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error:", error);
      process.exit(1);
    });
}

export { createVerifiableCredential };