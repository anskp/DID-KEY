// scripts/did-system/3-generate-did-key.js
import dotenv from 'dotenv';
import fs from 'fs';
import * as DIDKit from '@spruceid/didkit-wasm-node';

dotenv.config();

// Console colors for better output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bright: '\x1b[1m'
};

// Configuration for DID:KEY generation
const DID_CONFIG = {
    outputDir: './data/did-system',
    keyType: 'Ed25519', // Ed25519 is recommended for DID:KEY
    didMethod: 'key'
};

class DIDKeyGenerator {
    constructor(investorId) {
        this.investorId = investorId || process.env.INVESTOR_ID || 'test-investor-001';
        this.didKey = null;
        this.verificationMethod = null;
        this.privateKeyJWK = null;
        this.didDocument = null;
        this.ipfsCID = null;
        this.ipfsURL = null;
        this.errors = {};
        
        console.log(`🆔 Investor ID: ${this.investorId}`);
        console.log(`🔑 Key Type: ${DID_CONFIG.keyType}`);
        console.log(`📄 DID Method: did:${DID_CONFIG.didMethod}`);
    }

    async initializeDIDKit() {
        try {
            console.log(`\n${colors.cyan}${colors.bright}🔧 STEP 1: Initializing DIDKit${colors.reset}`);
            console.log('═'.repeat(50));

            console.log('📦 Loading DIDKit WASM module...');
            
            // Check if DIDKit is properly loaded
            if (!DIDKit) {
                throw new Error('DIDKit module not found');
            }

            // Get DIDKit version info
            const version = DIDKit.getVersion ? DIDKit.getVersion() : 'unknown';
            console.log(`${colors.green}✅ DIDKit loaded successfully${colors.reset}`);
            console.log(`${colors.blue}📋 DIDKit Version: ${version}${colors.reset}`);

            // Test basic DIDKit functionality
            console.log('🧪 Testing DIDKit functionality...');
            
            // Try to generate a test key to ensure everything works
            const testKey = DIDKit.generateEd25519Key();
            if (!testKey) {
                throw new Error('Failed to generate test Ed25519 key');
            }

            console.log(`${colors.green}✅ DIDKit functionality test passed${colors.reset}`);
            console.log(`${colors.blue}🔑 Ed25519 key generation: Working${colors.reset}`);

            return true;

        } catch (error) {
            console.error(`${colors.red}❌ DIDKit initialization failed:${colors.reset}`);
            console.error('Error details:', error.message);
            this.errors.didkitInit = error.message;
            return false;
        }
    }

    loadIPFSData() {
        try {
            console.log(`\n${colors.cyan}${colors.bright}📖 STEP 2: Loading IPFS Data${colors.reset}`);
            console.log('═'.repeat(50));

            // Load IPFS CID and URL from environment
            this.ipfsCID = process.env.IPFS_CID;
            this.ipfsURL = process.env.IPFS_URL;

            if (!this.ipfsCID) {
                throw new Error('IPFS_CID not found in environment variables. Please run Step 2 first.');
            }

            if (!this.ipfsURL) {
                throw new Error('IPFS_URL not found in environment variables. Please run Step 2 first.');
            }

            console.log(`${colors.green}✅ IPFS data loaded from environment${colors.reset}`);
            console.log(`${colors.blue}📋 IPFS CID: ${this.ipfsCID}${colors.reset}`);
            console.log(`${colors.blue}🔗 IPFS URL: ${this.ipfsURL.substring(0, 60)}...${colors.reset}`);

            // Validate CID format (basic check) - updated for modern IPFS formats
            if (!this.ipfsCID.startsWith('Qm') && !this.ipfsCID.startsWith('bafy') && !this.ipfsCID.startsWith('bafkrei')) {
                console.log(`${colors.yellow}⚠️ Warning: IPFS CID format might be invalid${colors.reset}`);
            }

            return true;

        } catch (error) {
            console.error(`${colors.red}❌ Failed to load IPFS data:${colors.reset}`, error.message);
            this.errors.ipfsDataLoad = error.message;
            return false;
        }
    }

    async generateKeyPair() {
        try {
            console.log(`\n${colors.cyan}${colors.bright}🔐 STEP 3: Generating Ed25519 Key Pair${colors.reset}`);
            console.log('═'.repeat(50));

            console.log('🎲 Generating cryptographic key pair...');
            
            // Generate Ed25519 key pair using DIDKit
            const privateKeyJWK = DIDKit.generateEd25519Key();
            
            if (!privateKeyJWK) {
                throw new Error('Failed to generate Ed25519 private key');
            }

            console.log(`${colors.green}✅ Ed25519 private key generated${colors.reset}`);

            // Parse the private key JWK
            const privateKey = JSON.parse(privateKeyJWK);
            console.log(`${colors.blue}🔑 Key Type: ${privateKey.kty}${colors.reset}`);
            console.log(`${colors.blue}📋 Curve: ${privateKey.crv}${colors.reset}`);
            console.log(`${colors.blue}🆔 Key ID: ${privateKey.kid || 'Not set'}${colors.reset}`);

            // Generate DID:KEY from private key using the correct method
            console.log('🔓 Generating DID:KEY from private key...');
            const didKey = DIDKit.keyToDID('key', privateKeyJWK);
            
            if (!didKey) {
                throw new Error('Failed to generate DID:KEY from private key');
            }

            console.log(`${colors.green}✅ DID:KEY generated successfully${colors.reset}`);

            // Store the keys and DID
            this.privateKeyJWK = privateKeyJWK;
            this.didKey = didKey;

            console.log(`${colors.green}✅ Key pair generation completed${colors.reset}`);
            console.log(`${colors.blue}🔑 DID:KEY: ${this.didKey.substring(0, 60)}...${colors.reset}`);

            return true;

        } catch (error) {
            console.error(`${colors.red}❌ Failed to generate key pair:${colors.reset}`, error.message);
            this.errors.keyGeneration = error.message;
            return false;
        }
    }

    async createDIDDocument() {
        try {
            console.log(`\n${colors.cyan}${colors.bright}📄 STEP 4: Creating DID Document${colors.reset}`);
            console.log('═'.repeat(50));

            console.log('📝 Manually constructing DID Document...');

            // Parse the private key to get the public key bytes
            const privateKey = JSON.parse(this.privateKeyJWK);
            
            // For did:key method, we need to construct the document manually
            // since the DIDKit version doesn't support keyToDIDDocument
            
            // Extract the public key from the DID:KEY
            // DID:KEY format: did:key:z6Mk... where z6Mk indicates Ed25519 public key
            const publicKeyMultibase = this.didKey.replace('did:key:', '');
            
            // Create verification method ID
            const verificationMethodId = `${this.didKey}#${publicKeyMultibase}`;
            
            console.log(`${colors.blue}🔑 Public Key Multibase: ${publicKeyMultibase.substring(0, 20)}...${colors.reset}`);
            console.log(`${colors.blue}🆔 Verification Method ID: ${verificationMethodId.substring(0, 60)}...${colors.reset}`);

            // Construct the base DID Document according to DID:KEY spec
            const baseDIDDocument = {
                "@context": [
                    "https://www.w3.org/ns/did/v1",
                    "https://w3id.org/security/suites/ed25519-2020/v1"
                ],
                "id": this.didKey,
                "verificationMethod": [
                    {
                        "id": verificationMethodId,
                        "type": "Ed25519VerificationKey2020",
                        "controller": this.didKey,
                        "publicKeyMultibase": publicKeyMultibase
                    }
                ],
                "authentication": [verificationMethodId],
                "assertionMethod": [verificationMethodId],
                "keyAgreement": [verificationMethodId],
                "capabilityInvocation": [verificationMethodId],
                "capabilityDelegation": [verificationMethodId]
            };

            console.log(`${colors.green}✅ Base DID Document constructed manually${colors.reset}`);
            console.log(`${colors.blue}📋 DID: ${baseDIDDocument.id}${colors.reset}`);
            console.log(`${colors.blue}🔑 Verification Methods: ${baseDIDDocument.verificationMethod?.length || 0}${colors.reset}`);

            // Enhance the DID Document with our IPFS service
            console.log('🔗 Adding IPFS service to DID Document...');

            const enhancedDIDDocument = {
                ...baseDIDDocument,
                service: [
                    {
                        id: `${baseDIDDocument.id}#linked-wallet-hashes`,
                        type: 'LinkedWalletHashes',
                        serviceEndpoint: this.ipfsURL,
                        description: 'Cross-chain wallet address hashes for investor identity verification',
                        properties: {
                            ipfsCID: this.ipfsCID,
                            purpose: 'investor-identity',
                            hashAlgorithm: 'sha256',
                            supportedChains: ['bitcoin', 'ethereum', 'solana'],
                            version: '1.0.0',
                            createdAt: new Date().toISOString()
                        }
                    },
                    {
                        id: `${baseDIDDocument.id}#verification-service`,
                        type: 'WalletVerificationService',
                        serviceEndpoint: 'https://api.example.com/verify-wallet-ownership',
                        description: 'Service for verifying wallet ownership through signature challenges',
                        properties: {
                            supportedMethods: ['signature-challenge'],
                            supportedChains: ['bitcoin', 'ethereum', 'solana'],
                            responseFormat: 'W3C-VC'
                        }
                    }
                ],
                // Add metadata about the DID creation
                metadata: {
                    investorId: this.investorId,
                    purpose: 'Cross-chain investor identity',
                    createdAt: new Date().toISOString(),
                    version: '1.0.0',
                    walletHashesIPFS: this.ipfsCID,
                    generatedWith: 'manual-construction-didkit-wasm'
                }
            };

            this.didDocument = enhancedDIDDocument;

            console.log(`${colors.green}✅ Enhanced DID Document created${colors.reset}`);
            console.log(`${colors.blue}📋 Services added: ${enhancedDIDDocument.service?.length || 0}${colors.reset}`);
            console.log(`${colors.blue}🔗 IPFS Service ID: ${enhancedDIDDocument.service[0].id}${colors.reset}`);

            // Extract verification method for future use
            if (enhancedDIDDocument.verificationMethod && enhancedDIDDocument.verificationMethod.length > 0) {
                this.verificationMethod = enhancedDIDDocument.verificationMethod[0];
                console.log(`${colors.blue}🔐 Verification Method: ${this.verificationMethod.id.substring(0, 60)}...${colors.reset}`);
            }

            return true;

        } catch (error) {
            console.error(`${colors.red}❌ Failed to create DID Document:${colors.reset}`, error.message);
            this.errors.didDocumentCreation = error.message;
            return false;
        }
    }

    async saveDIDData() {
        try {
            console.log(`\n${colors.cyan}${colors.bright}💾 STEP 5: Saving DID Data${colors.reset}`);
            console.log('═'.repeat(50));

            // Ensure output directory exists
            if (!fs.existsSync(DID_CONFIG.outputDir)) {
                fs.mkdirSync(DID_CONFIG.outputDir, { recursive: true });
                console.log(`📁 Created directory: ${DID_CONFIG.outputDir}`);
            }

            // Prepare complete DID data
            const didData = {
                metadata: {
                    investorId: this.investorId,
                    step: 'DID:KEY Generation Complete',
                    version: '1.0.0',
                    createdAt: new Date().toISOString(),
                    keyType: DID_CONFIG.keyType,
                    didMethod: DID_CONFIG.didMethod
                },
                did: this.didDocument.id,
                didDocument: this.didDocument,
                keys: {
                    // Note: In production, store private key securely (encrypted)
                    privateKeyJWK: JSON.parse(this.privateKeyJWK),
                    didKey: this.didKey
                },
                ipfsData: {
                    cid: this.ipfsCID,
                    url: this.ipfsURL
                },
                verificationMethod: this.verificationMethod,
                nextSteps: [
                    'Issue Verifiable Credentials with this DID as subject',
                    'Implement wallet ownership verification via signature challenge',
                    'Create investor profile with cross-chain wallet proofs',
                    'Set up credential presentation for verification'
                ]
            };

            // Save complete DID data
            const didDataPath = `${DID_CONFIG.outputDir}/${this.investorId}-did-complete.json`;
            fs.writeFileSync(didDataPath, JSON.stringify(didData, null, 2));
            console.log(`✅ Complete DID data saved to: ${didDataPath}`);

            // Save DID Document separately (standard format)
            const didDocPath = `${DID_CONFIG.outputDir}/${this.investorId}-did-document.json`;
            fs.writeFileSync(didDocPath, JSON.stringify(this.didDocument, null, 2));
            console.log(`✅ DID Document saved to: ${didDocPath}`);

            // Save private key separately (for secure storage)
            const privateKeyPath = `${DID_CONFIG.outputDir}/${this.investorId}-private-key.json`;
            const privateKeyData = {
                investorId: this.investorId,
                did: this.didDocument.id,
                keyType: DID_CONFIG.keyType,
                privateKeyJWK: JSON.parse(this.privateKeyJWK),
                createdAt: new Date().toISOString(),
                warning: 'KEEP THIS FILE SECURE - Contains private key material'
            };
            fs.writeFileSync(privateKeyPath, JSON.stringify(privateKeyData, null, 2));
            console.log(`✅ Private key saved to: ${privateKeyPath}`);

            // Update environment file with DID information
            console.log('📝 Updating .env file with DID information...');
            let envContent = fs.readFileSync('.env', 'utf8');

            const envUpdates = {
                DID_KEY: this.didKey,
                DID_VERIFICATION_METHOD: this.verificationMethod?.id || '',
                DID_CREATED_AT: new Date().toISOString()
            };

            for (const [key, value] of Object.entries(envUpdates)) {
                const regex = new RegExp(`^${key}=.*$`, 'm');
                if (regex.test(envContent)) {
                    envContent = envContent.replace(regex, `${key}=${value}`);
                    console.log(`✅ Updated existing ${key}`);
                } else {
                    envContent += `\n${key}=${value}`;
                    console.log(`✅ Added new ${key}`);
                }
            }

            fs.writeFileSync('.env', envContent);
            console.log(`${colors.green}✅ Environment file updated${colors.reset}`);

            return {
                didDataPath,
                didDocPath,
                privateKeyPath,
                didData,
                envUpdates
            };

        } catch (error) {
            console.error(`${colors.red}❌ Failed to save DID data:${colors.reset}`, error.message);
            this.errors.saveData = error.message;
            return null;
        }
    }

    async testDIDValidation() {
        try {
            console.log(`\n${colors.cyan}${colors.bright}🔍 STEP 6: Validating DID Document${colors.reset}`);
            console.log('═'.repeat(50));

            console.log('🧪 Validating constructed DID Document...');

            // Since DIDKit.resolveDID might not work with this version,
            // let's validate the document structure manually
            
            if (!this.didDocument || !this.didDocument.id) {
                throw new Error('DID Document is missing or has no ID');
            }

            if (!this.didDocument.verificationMethod || this.didDocument.verificationMethod.length === 0) {
                throw new Error('DID Document has no verification methods');
            }

            if (!this.didDocument.service || this.didDocument.service.length === 0) {
                throw new Error('DID Document has no services');
            }

            console.log(`${colors.green}✅ DID Document structure validation passed${colors.reset}`);
            console.log(`${colors.blue}📋 DID ID: ${this.didDocument.id}${colors.reset}`);
            console.log(`${colors.blue}🔑 Verification Methods: ${this.didDocument.verificationMethod.length}${colors.reset}`);
            console.log(`${colors.blue}🔗 Services: ${this.didDocument.service.length}${colors.reset}`);

            // Check if our services are present
            const walletHashService = this.didDocument.service.find(s => s.type === 'LinkedWalletHashes');
            const verificationService = this.didDocument.service.find(s => s.type === 'WalletVerificationService');

            if (walletHashService) {
                console.log(`${colors.green}✅ LinkedWalletHashes service found${colors.reset}`);
                console.log(`${colors.blue}   IPFS CID: ${walletHashService.properties.ipfsCID}${colors.reset}`);
            }

            if (verificationService) {
                console.log(`${colors.green}✅ WalletVerificationService found${colors.reset}`);
            }

            // Try DIDKit.resolveDID if available (but don't fail if it doesn't work)
            try {
                console.log('🔍 Attempting DIDKit resolution test...');
                const resolvedDIDDocument = DIDKit.resolveDID(this.didKey, '{}');
                
                if (resolvedDIDDocument) {
                    const resolution = JSON.parse(resolvedDIDDocument);
                    if (resolution.didDocument) {
                        console.log(`${colors.green}✅ DIDKit resolution also successful${colors.reset}`);
                    }
                }
            } catch (resolutionError) {
                console.log(`${colors.yellow}⚠️ DIDKit resolution not available, but manual validation passed${colors.reset}`);
            }

            return true;

        } catch (error) {
            console.error(`${colors.red}❌ DID Document validation failed:${colors.reset}`, error.message);
            this.errors.didValidation = error.message;
            return false;
        }
    }

    generateSummary() {
        console.log(`\n${colors.cyan}${colors.bright}📊 DID:KEY GENERATION SUMMARY${colors.reset}`);
        console.log('═'.repeat(50));

        const errorCount = Object.keys(this.errors).length;
        const success = this.didDocument && this.didDocument.id && errorCount === 0;

        console.log(`👤 Investor ID: ${this.investorId}`);
        console.log(`🔑 Key Type: ${DID_CONFIG.keyType}`);
        console.log(`📄 DID Method: did:${DID_CONFIG.didMethod}`);
        console.log(`✅ DID Generated: ${success ? '✅ Success' : '❌ Failed'}`);
        console.log(`❌ Errors: ${errorCount}`);

        if (this.didDocument) {
            console.log(`\n${colors.yellow}📋 GENERATED DID INFORMATION:${colors.reset}`);
            console.log(`  DID: ${this.didDocument.id}`);
            console.log(`  Verification Methods: ${this.didDocument.verificationMethod?.length || 0}`);
            console.log(`  Services: ${this.didDocument.service?.length || 0}`);
            
            if (this.didDocument.service && this.didDocument.service.length > 0) {
                console.log(`\n${colors.yellow}🔗 SERVICES:${colors.reset}`);
                this.didDocument.service.forEach((service, index) => {
                    console.log(`  ${index + 1}. ${service.type}:`);
                    console.log(`     ID: ${service.id}`);
                    console.log(`     Endpoint: ${service.serviceEndpoint.substring(0, 60)}...`);
                    if (service.properties?.ipfsCID) {
                        console.log(`     IPFS CID: ${service.properties.ipfsCID}`);
                    }
                    console.log('');
                });
            }

            if (this.verificationMethod) {
                console.log(`${colors.yellow}🔐 VERIFICATION METHOD:${colors.reset}`);
                console.log(`  ID: ${this.verificationMethod.id}`);
                console.log(`  Type: ${this.verificationMethod.type}`);
                console.log(`  Controller: ${this.verificationMethod.controller}`);
            }
        }

        if (errorCount > 0) {
            console.log(`${colors.red}❌ ERRORS:${colors.reset}`);
            Object.entries(this.errors).forEach(([key, error]) => {
                console.log(`  ${key}: ${error}`);
            });
        }

        return {
            success,
            investorId: this.investorId,
            did: this.didDocument?.id,
            didDocument: this.didDocument,
            verificationMethod: this.verificationMethod,
            ipfsCID: this.ipfsCID,
            errors: this.errors,
            nextSteps: success ? [
                'Step 4: Issue Verifiable Credentials using this DID',
                'Step 5: Implement wallet ownership verification',
                'Create investor verification flow',
                'Set up credential presentation system'
            ] : [
                'Fix the errors above',
                'Retry DID:KEY generation',
                'Check DIDKit installation'
            ]
        };
    }

    async run() {
        try {
            console.log(`${colors.bright}${colors.cyan}🔑 DID:KEY GENERATION${colors.reset}`);
            console.log(`${colors.cyan}⏰ Started: ${new Date().toISOString()}${colors.reset}`);
            console.log(`${colors.cyan}👤 Investor: ${this.investorId}${colors.reset}`);
            console.log('═'.repeat(60));

            // Initialize DIDKit
            if (!await this.initializeDIDKit()) {
                throw new Error('DIDKit initialization failed');
            }

            // Load IPFS data
            if (!this.loadIPFSData()) {
                throw new Error('Failed to load IPFS data');
            }

            // Generate key pair
            if (!await this.generateKeyPair()) {
                throw new Error('Failed to generate key pair');
            }

            // Create DID Document
            if (!await this.createDIDDocument()) {
                throw new Error('Failed to create DID Document');
            }

            // Save DID data
            const savedData = await this.saveDIDData();
            if (!savedData) {
                throw new Error('Failed to save DID data');
            }

            // Test DID validation
            if (!await this.testDIDValidation()) {
                console.log(`${colors.yellow}⚠️ DID validation had some issues, but DID was created${colors.reset}`);
            }

            const summary = this.generateSummary();

            console.log(`\n${colors.green}${colors.bright}🎉 DID:KEY GENERATION COMPLETED!${colors.reset}`);
            console.log(`📁 DID data saved to: ${savedData.didDataPath}`);
            console.log(`📄 DID Document: ${savedData.didDocPath}`);
            console.log(`🔑 DID: ${this.didDocument.id}`);

            return summary;

        } catch (error) {
            console.error(`\n${colors.red}${colors.bright}💥 DID:KEY GENERATION FAILED:${colors.reset}`);
            console.error('Main error:', error.message);

            const summary = this.generateSummary();
            summary.success = false;
            summary.mainError = error.message;
            return summary;
        }
    }
}

// Main execution
async function main() {
    try {
        const investorId = process.argv[2] || process.env.INVESTOR_ID || 'test-investor-001';
        console.log(`🎯 Generating DID:KEY for investor: ${investorId}`);

        const generator = new DIDKeyGenerator(investorId);
        const result = await generator.run();

        if (result.success) {
            console.log('\n✅ SUCCESS! Ready for Step 4: Issue Verifiable Credentials');
            console.log('Next command: node scripts/did-system/4-issue-credentials.js');
        } else {
            console.log('\n❌ FAILED! Check the errors above');
        }

        process.exit(result.success ? 0 : 1);

    } catch (error) {
        console.error('💥 Fatal error:', error.message);
        process.exit(1);
    }
}

// Export for use in other modules
export { DIDKeyGenerator };

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('3-generate-did-key.js')) {
    main();
}