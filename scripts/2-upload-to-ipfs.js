// scripts/did-system/2-upload-to-ipfs.js
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import axios from 'axios';

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

// Configuration for IPFS upload
const IPFS_CONFIG = {
    pinataAPI: 'https://api.pinata.cloud',
    outputDir: './data/did-system',
    hashingAlgorithm: 'sha256'
};

class WalletHashIPFSUploader {
    constructor(investorId) {
        this.investorId = investorId || process.env.INVESTOR_ID || 'test-investor-001';
        this.walletAddresses = {};
        this.hashedData = {};
        this.ipfsResult = null;
        this.errors = {};
        
        console.log(`🆔 Investor ID: ${this.investorId}`);
        console.log(`📁 Data directory: ${IPFS_CONFIG.outputDir}`);
    }

    validatePinataConfig() {
        console.log('🔧 Validating Pinata configuration...');
        
        const requiredEnvVars = ['PINATA_JWT'];
        const missingVars = [];
        
        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                missingVars.push(envVar);
            }
        }
        
        if (missingVars.length > 0) {
            console.error(`${colors.red}❌ Missing Pinata configuration:${colors.reset}`);
            missingVars.forEach(varName => {
                console.error(`   - ${varName}`);
            });
            console.log(`\n${colors.yellow}📝 Please add these to your .env file:${colors.reset}`);
            console.log(`PINATA_JWT=your_pinata_jwt_token`);
            console.log(`\n${colors.blue}💡 Get your JWT token from: https://app.pinata.cloud/developers/api-keys${colors.reset}`);
            return false;
        }
        
        console.log(`${colors.green}✅ Pinata configuration valid${colors.reset}`);
        console.log(`${colors.blue}🔑 JWT Token: ${process.env.PINATA_JWT.substring(0, 20)}...${colors.reset}`);
        return true;
    }

    loadWalletAddresses() {
        try {
            console.log(`\n${colors.cyan}${colors.bright}📖 STEP 1: Loading Wallet Addresses${colors.reset}`);
            console.log('═'.repeat(50));
            
            // Read wallet addresses from environment variables
            const wallets = {
                bitcoin: {
                    address: process.env.BTC_WALLET_ADDRESS,
                    legacyAddress: process.env.BTC_LEGACY_ADDRESS,
                    chain: 'bitcoin',
                    network: 'testnet',
                    name: 'Bitcoin Testnet'
                },
                ethereum: {
                    address: process.env.ETH_WALLET_ADDRESS,
                    chain: 'ethereum', 
                    network: 'sepolia',
                    name: 'Ethereum Sepolia'
                },
                solana: {
                    address: process.env.SOL_WALLET_ADDRESS,
                    chain: 'solana',
                    network: 'devnet', 
                    name: 'Solana Devnet'
                }
            };

            // Filter out wallets that don't have addresses
            const validWallets = {};
            let validCount = 0;

            for (const [chain, wallet] of Object.entries(wallets)) {
                if (wallet.address) {
                    validWallets[chain] = wallet;
                    validCount++;
                    console.log(`✅ ${wallet.name}: ${wallet.address}`);
                    if (wallet.legacyAddress) {
                        console.log(`   Legacy: ${wallet.legacyAddress}`);
                    }
                } else {
                    console.log(`❌ ${wallet.name}: No address found`);
                }
            }

            if (validCount === 0) {
                throw new Error('No valid wallet addresses found in environment variables');
            }

            this.walletAddresses = validWallets;
            
            console.log(`\n${colors.green}✅ Loaded ${validCount}/3 wallet addresses${colors.reset}`);
            return true;

        } catch (error) {
            console.error(`${colors.red}❌ Failed to load wallet addresses:${colors.reset}`, error.message);
            this.errors.walletLoading = error.message;
            return false;
        }
    }

    generateWalletHashes() {
        try {
            console.log(`\n${colors.cyan}${colors.bright}🔐 STEP 2: Generating SHA-256 Hashes${colors.reset}`);
            console.log('═'.repeat(50));

            const hashedWallets = {};
            const orderedAddresses = [];

            // Hash individual wallet addresses
            console.log('🔒 Hashing individual wallet addresses...');
            for (const [chain, wallet] of Object.entries(this.walletAddresses)) {
                const addressHash = crypto.createHash(IPFS_CONFIG.hashingAlgorithm)
                    .update(wallet.address)
                    .digest('hex');
                
                hashedWallets[chain] = {
                    originalAddress: wallet.address,
                    hashedAddress: addressHash,
                    chain: wallet.chain,
                    network: wallet.network,
                    name: wallet.name,
                    hashAlgorithm: IPFS_CONFIG.hashingAlgorithm
                };

                // Add legacy address hash if exists
                if (wallet.legacyAddress) {
                    const legacyHash = crypto.createHash(IPFS_CONFIG.hashingAlgorithm)
                        .update(wallet.legacyAddress)
                        .digest('hex');
                    hashedWallets[chain].legacyAddressHash = legacyHash;
                }

                orderedAddresses.push({
                    chain: wallet.chain,
                    address: wallet.address
                });

                console.log(`✅ ${wallet.name}:`);
                console.log(`   Original: ${wallet.address}`);
                console.log(`   Hashed: ${addressHash.substring(0, 16)}...`);
                if (wallet.legacyAddress) {
                    console.log(`   Legacy Hash: ${hashedWallets[chain].legacyAddressHash.substring(0, 16)}...`);
                }
                console.log();
            }

            // Create combined hash of all addresses
            console.log('🔗 Creating combined hash of all wallets...');
            const sortedAddresses = orderedAddresses.sort((a, b) => a.chain.localeCompare(b.chain));
            const combinedString = sortedAddresses
                .map(w => `${w.chain}:${w.address}`)
                .join('|');

            const combinedHash = crypto.createHash(IPFS_CONFIG.hashingAlgorithm)
                .update(combinedString)
                .digest('hex');

            console.log(`✅ Combined source string: ${combinedString}`);
            console.log(`✅ Combined hash: ${combinedHash.substring(0, 16)}...`);

            // Create IPFS upload payload
            const ipfsPayload = {
                metadata: {
                    investorId: this.investorId,
                    purpose: 'Cross-chain investor identity verification',
                    version: '1.0.0',
                    hashAlgorithm: IPFS_CONFIG.hashingAlgorithm,
                    createdAt: new Date().toISOString(),
                    walletCount: Object.keys(hashedWallets).length,
                    chains: Object.values(hashedWallets).map(w => w.chain)
                },
                walletHashes: hashedWallets,
                combinedHash: {
                    hash: combinedHash,
                    source: combinedString,
                    algorithm: IPFS_CONFIG.hashingAlgorithm
                },
                verification: {
                    instructions: 'To verify wallet ownership, sign a challenge message with each wallet\'s private key',
                    supportedChains: ['bitcoin', 'ethereum', 'solana'],
                    format: 'W3C DID Document Service Entry'
                }
            };

            this.hashedData = ipfsPayload;

            console.log(`${colors.green}✅ Generated hashes for ${Object.keys(hashedWallets).length} wallets${colors.reset}`);
            return true;

        } catch (error) {
            console.error(`${colors.red}❌ Failed to generate hashes:${colors.reset}`, error.message);
            this.errors.hashing = error.message;
            return false;
        }
    }

    async testPinataConnection() {
        try {
            console.log(`\n${colors.cyan}${colors.bright}🔗 STEP 3: Testing Pinata Connection${colors.reset}`);
            console.log('═'.repeat(50));

            console.log('📡 Testing Pinata API connection...');
            
            const response = await axios.get(`${IPFS_CONFIG.pinataAPI}/data/testAuthentication`, {
                headers: {
                    'Authorization': `Bearer ${process.env.PINATA_JWT}`
                }
            });

            if (response.data && response.data.message === 'Congratulations! You are communicating with the Pinata API!') {
                console.log(`${colors.green}✅ Pinata connection successful${colors.reset}`);
                console.log(`${colors.blue}📊 Status: ${response.status}${colors.reset}`);
                console.log(`${colors.blue}💬 Message: ${response.data.message}${colors.reset}`);
                return true;
            } else {
                throw new Error('Unexpected response from Pinata API');
            }

        } catch (error) {
            console.error(`${colors.red}❌ Pinata connection test failed:${colors.reset}`);
            
            if (error.response) {
                console.error(`Status: ${error.response.status}`);
                console.error(`Response:`, error.response.data);
                
                if (error.response.status === 401) {
                    console.log(`${colors.yellow}💡 Authentication failed. Check your PINATA_JWT token${colors.reset}`);
                }
            } else {
                console.error('Error:', error.message);
            }
            
            this.errors.pinataConnection = error.message;
            return false;
        }
    }

    async uploadToIPFS() {
        try {
            console.log(`\n${colors.cyan}${colors.bright}📤 STEP 4: Uploading to IPFS via Pinata${colors.reset}`);
            console.log('═'.repeat(50));

            // Prepare metadata for Pinata
            const metadata = {
                name: `${this.investorId}-wallet-hashes.json`,
                description: `Hashed wallet addresses for investor ${this.investorId} - Cross-chain DID identity system`,
                keyvalues: {
                    investor_id: this.investorId,
                    purpose: 'did_identity',
                    wallet_count: Object.keys(this.hashedData.walletHashes).length.toString(),
                    chains: Object.values(this.hashedData.walletHashes).map(w => w.chain).join(','),
                    created_at: new Date().toISOString()
                }
            };

            // Create the upload payload
            const uploadData = {
                pinataContent: this.hashedData,
                pinataMetadata: metadata,
                pinataOptions: {
                    cidVersion: 1,
                    wrapWithDirectory: false
                }
            };

            console.log('📦 Preparing upload payload...');
            console.log(`📝 File name: ${metadata.name}`);
            console.log(`📊 Data size: ${JSON.stringify(this.hashedData).length} bytes`);
            console.log(`🏷️ Metadata keys: ${Object.keys(metadata.keyvalues).join(', ')}`);

            console.log('📡 Uploading to IPFS via Pinata...');
            const startTime = Date.now();

            const response = await axios.post(
                `${IPFS_CONFIG.pinataAPI}/pinning/pinJSONToIPFS`,
                uploadData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.PINATA_JWT}`
                    }
                }
            );

            const uploadTime = Date.now() - startTime;

            if (response.data && response.data.IpfsHash) {
                const ipfsHash = response.data.IpfsHash;
                const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
                
                console.log(`${colors.green}✅ Successfully uploaded to IPFS!${colors.reset}`);
                console.log(`${colors.blue}📋 IPFS Hash (CID): ${ipfsHash}${colors.reset}`);
                console.log(`${colors.blue}🔗 IPFS URL: ${ipfsUrl}${colors.reset}`);
                console.log(`${colors.blue}⚡ Upload time: ${uploadTime}ms${colors.reset}`);
                console.log(`${colors.blue}📏 Pinned size: ${response.data.PinSize} bytes${colors.reset}`);

                this.ipfsResult = {
                    cid: ipfsHash,
                    ipfsUrl: ipfsUrl,
                    pinataUrl: `https://app.pinata.cloud/pinmanager?cid=${ipfsHash}`,
                    uploadTime: uploadTime,
                    pinSize: response.data.PinSize,
                    timestamp: response.data.Timestamp,
                    uploadedAt: new Date().toISOString()
                };

                return true;
            } else {
                throw new Error('Invalid response from Pinata - no IPFS hash returned');
            }

        } catch (error) {
            console.error(`${colors.red}❌ Failed to upload to IPFS:${colors.reset}`);
            
            if (error.response) {
                console.error(`Status: ${error.response.status}`);
                console.error(`Response:`, error.response.data);
                
                if (error.response.status === 401) {
                    console.log(`${colors.yellow}💡 Authentication failed. Check your PINATA_JWT token${colors.reset}`);
                } else if (error.response.status === 402) {
                    console.log(`${colors.yellow}💡 Pinata plan limit reached. Check your account usage${colors.reset}`);
                }
            } else {
                console.error('Error:', error.message);
            }
            
            this.errors.ipfsUpload = error.message;
            return false;
        }
    }

    async saveResults() {
        try {
            console.log(`\n${colors.cyan}${colors.bright}💾 STEP 5: Saving Results${colors.reset}`);
            console.log('═'.repeat(50));

            // Ensure output directory exists
            if (!fs.existsSync(IPFS_CONFIG.outputDir)) {
                fs.mkdirSync(IPFS_CONFIG.outputDir, { recursive: true });
                console.log(`📁 Created directory: ${IPFS_CONFIG.outputDir}`);
            }

            // Prepare complete results
            const completeResults = {
                metadata: {
                    investorId: this.investorId,
                    step: 'IPFS Upload Complete',
                    version: '1.0.0',
                    completedAt: new Date().toISOString()
                },
                walletAddresses: this.walletAddresses,
                hashedData: this.hashedData,
                ipfsResult: this.ipfsResult,
                nextSteps: [
                    'Generate DID:KEY using DIDKit',
                    'Create DID Document with IPFS CID in service field',
                    'Issue Verifiable Credentials',
                    'Implement wallet ownership verification'
                ]
            };

            // Save complete results
            const resultsPath = `${IPFS_CONFIG.outputDir}/${this.investorId}-ipfs-results.json`;
            fs.writeFileSync(resultsPath, JSON.stringify(completeResults, null, 2));
            console.log(`✅ Complete results saved to: ${resultsPath}`);

            // Update environment file with IPFS info
            console.log('📝 Updating .env file with IPFS information...');
            let envContent = fs.readFileSync('.env', 'utf8');

            const envUpdates = {
                IPFS_CID: this.ipfsResult.cid,
                IPFS_URL: this.ipfsResult.ipfsUrl,
                WALLET_HASHES_UPLOADED_AT: new Date().toISOString()
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
                resultsPath,
                completeResults,
                envUpdates
            };

        } catch (error) {
            console.error(`${colors.red}❌ Failed to save results:${colors.reset}`, error.message);
            this.errors.saveResults = error.message;
            return null;
        }
    }

    generateSummary() {
        console.log(`\n${colors.cyan}${colors.bright}📊 IPFS UPLOAD SUMMARY${colors.reset}`);
        console.log('═'.repeat(50));

        const walletCount = Object.keys(this.walletAddresses).length;
        const hashCount = Object.keys(this.hashedData.walletHashes || {}).length;
        const errorCount = Object.keys(this.errors).length;
        const success = this.ipfsResult && this.ipfsResult.cid && errorCount === 0;

        console.log(`👤 Investor ID: ${this.investorId}`);
        console.log(`💼 Wallets processed: ${walletCount}/3`);
        console.log(`🔐 Hashes generated: ${hashCount}`);
        console.log(`📤 IPFS upload: ${success ? '✅ Success' : '❌ Failed'}`);
        console.log(`❌ Errors: ${errorCount}`);

        if (this.ipfsResult) {
            console.log(`\n${colors.yellow}📋 IPFS INFORMATION:${colors.reset}`);
            console.log(`  CID: ${this.ipfsResult.cid}`);
            console.log(`  URL: ${this.ipfsResult.ipfsUrl}`);
            console.log(`  Size: ${this.ipfsResult.pinSize} bytes`);
            console.log(`  Upload time: ${this.ipfsResult.uploadTime}ms`);
        }

        if (hashCount > 0) {
            console.log(`\n${colors.yellow}🔐 GENERATED HASHES:${colors.reset}`);
            Object.entries(this.hashedData.walletHashes).forEach(([chain, data]) => {
                console.log(`  ${data.name}:`);
                console.log(`    Address: ${data.originalAddress}`);
                console.log(`    Hash: ${data.hashedAddress.substring(0, 16)}...`);
                if (data.legacyAddressHash) {
                    console.log(`    Legacy Hash: ${data.legacyAddressHash.substring(0, 16)}...`);
                }
                console.log('');
            });
            
            console.log(`  Combined Hash: ${this.hashedData.combinedHash.hash.substring(0, 16)}...`);
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
            walletCount,
            hashCount,
            ipfsResult: this.ipfsResult,
            errors: this.errors,
            nextSteps: success ? [
                'Step 3: Generate DID:KEY using DIDKit',
                'Step 4: Create DID Document with IPFS CID',
                'Step 5: Issue Verifiable Credentials'
            ] : [
                'Fix the errors above',
                'Retry IPFS upload',
                'Check Pinata configuration'
            ]
        };
    }

    async run() {
        try {
            console.log(`${colors.bright}${colors.cyan}📤 IPFS WALLET HASH UPLOAD${colors.reset}`);
            console.log(`${colors.cyan}⏰ Started: ${new Date().toISOString()}${colors.reset}`);
            console.log(`${colors.cyan}👤 Investor: ${this.investorId}${colors.reset}`);
            console.log('═'.repeat(60));

            // Validate configuration
            if (!this.validatePinataConfig()) {
                throw new Error('Pinata configuration invalid');
            }

            // Load wallet addresses
            if (!this.loadWalletAddresses()) {
                throw new Error('Failed to load wallet addresses');
            }

            // Generate hashes
            if (!this.generateWalletHashes()) {
                throw new Error('Failed to generate wallet hashes');
            }

            // Test Pinata connection
            if (!await this.testPinataConnection()) {
                throw new Error('Pinata connection test failed');
            }

            // Upload to IPFS
            if (!await this.uploadToIPFS()) {
                throw new Error('IPFS upload failed');
            }

            // Save results
            const savedResults = await this.saveResults();
            if (!savedResults) {
                throw new Error('Failed to save results');
            }

            const summary = this.generateSummary();

            console.log(`\n${colors.green}${colors.bright}🎉 IPFS UPLOAD COMPLETED!${colors.reset}`);
            console.log(`📁 Results saved to: ${savedResults.resultsPath}`);
            console.log(`🔗 IPFS URL: ${this.ipfsResult.ipfsUrl}`);

            return summary;

        } catch (error) {
            console.error(`\n${colors.red}${colors.bright}💥 IPFS UPLOAD FAILED:${colors.reset}`);
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
        console.log(`🎯 Uploading wallet hashes for investor: ${investorId}`);

        const uploader = new WalletHashIPFSUploader(investorId);
        const result = await uploader.run();

        if (result.success) {
            console.log('\n✅ SUCCESS! Ready for Step 3: DID:KEY Generation');
            console.log('Next command: node scripts/did-system/3-generate-did-key.js');
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
export { WalletHashIPFSUploader };

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('2-upload-to-ipfs.js')) {
    main();
}