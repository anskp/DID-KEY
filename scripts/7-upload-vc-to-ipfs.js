import fs from 'fs';
import FormData from 'form-data';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
dotenv.config();

async function uploadVCToIPFS() {
  console.log("📦 Uploading Signed Verifiable Credential to IPFS...\n");

  try {
    // Check if signed VC exists
    const signedVCFile = "./data/vc-system/verifiable-credential-signed.json";
    if (!fs.existsSync(signedVCFile)) {
      throw new Error("Signed VC not found! Run sign-verifiable-credential.js first.");
    }

    // Load signed VC
    const signedVC = JSON.parse(fs.readFileSync(signedVCFile, 'utf8'));
    console.log("📄 Loaded signed VC from:", signedVCFile);

    // Get Pinata credentials from environment
    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecretKey = process.env.PINATA_SECRET_KEY;
    const pinataJWT = process.env.PINATA_JWT;

    if (!pinataJWT && (!pinataApiKey || !pinataSecretKey)) {
      throw new Error("Pinata credentials not found in .env file. Provide PINATA_JWT or both PINATA_API_KEY and PINATA_SECRET_KEY.");
    }

    console.log("🔑 Using Pinata credentials...");
    if (pinataJWT) {
      console.log(`📋 Auth: JWT (first 20 chars): ${pinataJWT.substring(0, 20)}...`);
    } else {
      console.log(`📋 API Key: ${pinataApiKey.substring(0, 8)}...`);
    }

    // Prepare VC data for upload
    const vcString = JSON.stringify(signedVC, null, 2);
    const vcBuffer = Buffer.from(vcString, 'utf8');

    console.log(`📏 VC Size: ${vcBuffer.length} bytes`);
    console.log(`🆔 VC Subject: ${signedVC.credentialSubject.id}`);
    console.log(`👤 VC Holder: ${signedVC.credentialSubject.full_name}`);

    // Create form data for Pinata upload
    const formData = new FormData();
    formData.append('file', vcBuffer, {
      filename: `vc-${signedVC.credentialSubject.applicant_id}-${Date.now()}.json`,
      contentType: 'application/json'
    });

    // Pinata metadata
    const metadata = {
      name: `Verifiable Credential - ${signedVC.credentialSubject.full_name}`,
      description: `KYC Verified Credential for multi-chain DID ${signedVC.credentialSubject.id}`,
      keyvalues: {
        type: "VC",
        cred: "KYCVerified",
        subject: signedVC.credentialSubject.id,
        issuer: signedVC.issuer,
        applicantId: signedVC.credentialSubject.applicant_id,
        kycStatus: signedVC.credentialSubject.kycStatus,
        chains: Object.keys(signedVC.credentialSubject.wallets).join(','),
        issued: signedVC.issuanceDate,
        exp: signedVC.expirationDate
      }
    };

    formData.append('pinataMetadata', JSON.stringify(metadata));

    // Pinata options
    const options = {
      cidVersion: 1,
      wrapWithDirectory: false
    };
    formData.append('pinataOptions', JSON.stringify(options));

    console.log("\n🚀 Uploading to IPFS via Pinata...");
    console.log("⏳ This may take a few seconds...");

    // Upload to Pinata
    const headers = {
      ...formData.getHeaders(),
    };
    if (pinataJWT) {
      headers.Authorization = `Bearer ${pinataJWT}`;
    } else {
      headers.pinata_api_key = pinataApiKey;
      headers.pinata_secret_api_key = pinataSecretKey;
    }

    const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
      maxBodyLength: 'Infinity',
      headers
    });

    if (response.status !== 200) {
      throw new Error(`Pinata upload failed: ${response.status} ${response.statusText}`);
    }

    const vcCID = response.data.IpfsHash;
    const vcIPFSUrl = `https://gateway.pinata.cloud/ipfs/${vcCID}`;
    const vcIPFSUri = `ipfs://${vcCID}`;

    console.log("\n✅ VERIFIABLE CREDENTIAL UPLOADED TO IPFS!");
    console.log("═".repeat(70));
    console.log(`📦 IPFS CID: ${vcCID}`);
    console.log(`🌐 IPFS URL: ${vcIPFSUrl}`);
    console.log(`🔗 IPFS URI: ${vcIPFSUri}`);
    console.log(`📊 Pin Size: ${response.data.PinSize} bytes`);
    console.log(`⏰ Pinned At: ${response.data.Timestamp}`);

    // Test IPFS accessibility
    console.log("\n🔍 Testing IPFS accessibility...");
    try {
      const testResponse = await axios.get(vcIPFSUrl, { timeout: 10000 });
      if (testResponse.status === 200) {
        console.log("✅ IPFS URL accessible");
        
        // Verify the uploaded data matches our original VC
        const uploadedVC = testResponse.data;
        if (uploadedVC.credentialSubject && uploadedVC.credentialSubject.id === signedVC.credentialSubject.id) {
          console.log("✅ Uploaded VC matches original");
        } else {
          console.log("⚠️ Uploaded VC might not match original");
        }
      }
    } catch (error) {
      console.log("⚠️ IPFS URL not immediately accessible (normal propagation delay)");
    }

    // Update metadata file
    const metadataFile = "./data/vc-system/vc-metadata.json";
    let metadata_obj = {};
    if (fs.existsSync(metadataFile)) {
      metadata_obj = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    }

    metadata_obj.vcCID = vcCID;
    metadata_obj.vcIPFSUrl = vcIPFSUrl; 
    metadata_obj.vcIPFSUri = vcIPFSUri;
    metadata_obj.uploadedAt = new Date().toISOString();
    metadata_obj.pinataResponse = {
      ipfsHash: response.data.IpfsHash,
      pinSize: response.data.PinSize,
      timestamp: response.data.Timestamp
    };

    fs.writeFileSync(metadataFile, JSON.stringify(metadata_obj, null, 2));

    // Also update .env for easy access
    let envContent = fs.readFileSync('.env', 'utf8');
    
    // Remove old VC IPFS entries if they exist
    envContent = envContent
      .split('\n')
      .filter(line => 
        !line.startsWith('VC_IPFS_CID=') &&
        !line.startsWith('VC_IPFS_URL=') &&
        !line.startsWith('VC_IPFS_URI=')
      )
      .join('\n');

    // Add new VC IPFS entries
    const newEnvVars = `
# Verifiable Credential IPFS (Step 3)
VC_IPFS_CID=${vcCID}
VC_IPFS_URL=${vcIPFSUrl}
VC_IPFS_URI=${vcIPFSUri}
VC_UPLOADED_AT=${new Date().toISOString()}
`;

    envContent += newEnvVars;
    fs.writeFileSync('.env', envContent);

    console.log("\n📋 CREDENTIAL DETAILS:");
    console.log("═".repeat(70));
    console.log(`🆔 DID: ${signedVC.credentialSubject.id}`);
    console.log(`👤 Name: ${signedVC.credentialSubject.full_name}`);
    console.log(`✅ KYC Status: ${signedVC.credentialSubject.kycStatus}`);
    console.log(`🏦 Wallets: ${Object.keys(signedVC.credentialSubject.wallets).join(', ').toUpperCase()}`);
    console.log(`📦 Wallet Metadata: ${signedVC.credentialSubject.walletMetadata}`);
    console.log(`⏰ Valid Until: ${signedVC.expirationDate}`);

    console.log("\n📋 NEXT STEPS:");
    console.log("═".repeat(70));
    console.log("1. ✅ VC JSON created");
    console.log("2. ✅ VC signed with Ed25519");
    console.log("3. ✅ VC uploaded to IPFS");
    console.log("4. 🏗️ Deploy SBT smart contract");
    console.log("5. 🎖️ Mint SBT with VC data");

    console.log("\n🚀 Ready for Step 4: SBT Contract Deployment!");
    console.log(`💾 VC accessible at: ${vcIPFSUrl}`);
    console.log(`📊 Updated metadata: ${metadataFile}`);
    console.log(`🔧 .env updated with VC IPFS details`);

    return {
      vcCID: vcCID,
      vcIPFSUrl: vcIPFSUrl,
      vcIPFSUri: vcIPFSUri,
      signedVC: signedVC
    };

  } catch (error) {
    console.error("❌ IPFS upload failed:", error.message);
    
    if (error.response) {
      console.error("📋 Response details:", {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    process.exit(1);
  }
}

// Run the script
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  uploadVCToIPFS()
    .then(() => {
      console.log("\n🎉 VC IPFS UPLOAD COMPLETED!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error:", error);
      process.exit(1);
    });
}

export { uploadVCToIPFS };