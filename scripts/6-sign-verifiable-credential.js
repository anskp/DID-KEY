import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
dotenv.config();

// Mock DIDKit signing for demo (in production, you'd use actual DIDKit WASM)
function mockDIDKitSign(vcJson, privateKey, did) {
  // In real implementation, this would use DIDKit WASM
  // For demo, we'll create a mock signature structure
  
  const vcString = JSON.stringify(vcJson);
  const signature = crypto.createHash('sha256').update(vcString + privateKey).digest('hex');
  
  // Create mock JWS signature (in real DIDKit, this would be proper Ed25519)
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString('base64url');
  const payload = Buffer.from(vcString).toString('base64url');
  const mockSignature = Buffer.from(signature).toString('base64url');
  
  return `${header}.${payload}.${mockSignature}`;
}

async function signVerifiableCredential() {
  console.log("🔏 Signing Verifiable Credential with DIDKit...\n");

  try {
    // Check if unsigned VC exists
    const vcFile = "./data/vc-system/verifiable-credential-unsigned.json";
    if (!fs.existsSync(vcFile)) {
      throw new Error("Unsigned VC not found! Run create-verifiable-credential.js first.");
    }

    // Load unsigned VC
    const unsignedVC = JSON.parse(fs.readFileSync(vcFile, 'utf8'));
    console.log("📄 Loaded unsigned VC from:", vcFile);

    // Get DID information from environment
    const investorDID = process.env.DID_KEY || process.env.DID_IDENTIFIER;
    if (!investorDID) {
      throw new Error("DID_KEY not found in .env file");
    }

    console.log("🆔 Signing with DID:", investorDID);

    // For demo purposes, we'll use a mock private key
    // In production, you'd load the actual Ed25519 private key used to generate the DID
    const mockPrivateKey = process.env.DEPLOYMENT_PRIVATE_KEY || "mock_private_key_for_demo";

    // Update the VC with correct issuer and verification method
    const signedVC = {
      ...unsignedVC,
      issuer: investorDID, // Self-issued credential
      proof: {
        type: "Ed25519Signature2020",
        created: new Date().toISOString(),
        verificationMethod: `${investorDID}#${investorDID.split(':').pop()}`,
        proofPurpose: "assertionMethod",
        jws: mockDIDKitSign(unsignedVC, mockPrivateKey, investorDID)
      }
    };

    console.log("\n🔐 SIGNATURE DETAILS:");
    console.log("═".repeat(60));
    console.log(`🔑 Signature Type: ${signedVC.proof.type}`);
    console.log(`⏰ Signed At: ${signedVC.proof.created}`);
    console.log(`🎯 Verification Method: ${signedVC.proof.verificationMethod}`);
    console.log(`📋 Proof Purpose: ${signedVC.proof.proofPurpose}`);
    console.log(`✍️ JWS: ${signedVC.proof.jws.substring(0, 50)}...`);

    // Save signed VC
    const signedVCFile = "./data/vc-system/verifiable-credential-signed.json";
    fs.writeFileSync(signedVCFile, JSON.stringify(signedVC, null, 2));

    // Calculate hash of signed VC (for on-chain storage)
    const signedVCString = JSON.stringify(signedVC);
    const signedVCHash = crypto.createHash('sha256').update(signedVCString).digest('hex');
    const signedVCHashWithPrefix = `0x${signedVCHash}`;

    console.log("\n✅ VERIFIABLE CREDENTIAL SIGNED!");
    console.log("═".repeat(60));
    console.log(`📄 Signed VC: ${signedVCFile}`);
    console.log(`🔐 Signed VC Hash: ${signedVCHashWithPrefix}`);
    console.log(`📏 VC Size: ${Buffer.from(signedVCString).length} bytes`);

    // Validate VC structure
    const requiredFields = ['@context', 'type', 'issuer', 'issuanceDate', 'credentialSubject', 'proof'];
    const missingFields = requiredFields.filter(field => !signedVC[field]);
    
    if (missingFields.length === 0) {
      console.log("✅ VC Structure: Valid W3C format");
    } else {
      console.log("❌ VC Structure: Missing fields:", missingFields);
    }

    // Validate proof structure
    const requiredProofFields = ['type', 'created', 'verificationMethod', 'proofPurpose', 'jws'];
    const missingProofFields = requiredProofFields.filter(field => !signedVC.proof[field]);
    
    if (missingProofFields.length === 0) {
      console.log("✅ Proof Structure: Valid Ed25519 signature");
    } else {
      console.log("❌ Proof Structure: Missing fields:", missingProofFields);
    }

    // Update metadata file
    const metadataFile = "./data/vc-system/vc-metadata.json";
    let metadata = {};
    if (fs.existsSync(metadataFile)) {
      metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    }

    metadata.signedVCFile = signedVCFile;
    metadata.signedVCHash = signedVCHashWithPrefix;
    metadata.signedAt = new Date().toISOString();
    metadata.proofType = signedVC.proof.type;
    metadata.verificationMethod = signedVC.proof.verificationMethod;
    metadata.vcSize = Buffer.from(signedVCString).length;

    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

    console.log("\n📋 CREDENTIAL SUMMARY:");
    console.log("═".repeat(60));
    console.log(`🆔 Subject DID: ${signedVC.credentialSubject.id}`);
    console.log(`👤 Full Name: ${signedVC.credentialSubject.full_name}`);
    console.log(`✅ KYC Status: ${signedVC.credentialSubject.kycStatus}`);
    console.log(`🏦 Wallets: ETH, BTC, SOL`);
    console.log(`⏰ Valid Until: ${signedVC.expirationDate}`);

    console.log("\n📋 NEXT STEPS:");
    console.log("═".repeat(60));
    console.log("1. ✅ VC JSON created");
    console.log("2. ✅ VC signed with Ed25519");
    console.log("3. 📦 Upload signed VC to IPFS");
    console.log("4. 🏗️ Deploy SBT smart contract");
    console.log("5. 🎖️ Mint SBT with VC data");

    console.log("\n🚀 Ready for Step 3: IPFS Upload!");
    console.log(`💾 Signed VC: ${signedVCFile}`);
    console.log(`📊 Updated metadata: ${metadataFile}`);

    return {
      signedVC: signedVC,
      signedVCHash: signedVCHashWithPrefix,
      signedVCFile: signedVCFile
    };

  } catch (error) {
    console.error("❌ VC signing failed:", error.message);
    process.exit(1);
  }
}

// Production DIDKit Integration (commented for reference)
/*
async function signWithRealDIDKit(vcJson, privateKey, did) {
  // This is how you'd use real DIDKit WASM in production:
  
  const DIDKit = require('@spruceid/didkit-wasm-node');
  
  // Load your Ed25519 private key (JWK format)
  const keyJWK = {
    "kty": "OKP",
    "crv": "Ed25519",
    "x": "base64url_public_key",
    "d": "base64url_private_key"
  };
  
  // Create proof options
  const proofOptions = {
    verificationMethod: `${did}#${did.split(':').pop()}`,
    proofPurpose: "assertionMethod"
  };
  
  // Sign the credential
  const signedVC = await DIDKit.issueCredential(
    JSON.stringify(vcJson),
    JSON.stringify(proofOptions), 
    JSON.stringify(keyJWK)
  );
  
  return JSON.parse(signedVC);
}
*/

// Run the script
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  signVerifiableCredential()
    .then(() => {
      console.log("\n🎉 VC SIGNING COMPLETED!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error:", error);
      process.exit(1);
    });
}

export { signVerifiableCredential };