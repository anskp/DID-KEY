// server.js - Fixed version with proper error handling
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { spawn } from 'child_process';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip}`);
    next();
});

// Basic routes
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to Investor DID API',
        status: 'Server is running!',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: 'GET /health',
            extractWallets: 'POST /extract-wallets',
            envInfo: 'GET /env-info',
            runScript: 'POST /run-script/:scriptName'
        },
        environment: {
            nodeEnv: process.env.NODE_ENV,
            vaultId: process.env.VAULT_ACCOUNT_ID,
            hasFireblocksConfig: !!(process.env.FIREBLOCKS_API_KEY && process.env.FIREBLOCKS_SECRET_KEY_PATH)
        }
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        environment: {
            nodeEnv: process.env.NODE_ENV,
            port: PORT,
            fireblocks: {
                apiKey: process.env.FIREBLOCKS_API_KEY ? '***configured***' : 'missing',
                secretKeyPath: process.env.FIREBLOCKS_SECRET_KEY_PATH || 'missing',
                baseUrl: process.env.FIREBLOCKS_BASE_URL || 'default'
            }
        }
    });
});

// Environment info endpoint
app.get('/env-info', (req, res) => {
    res.json({
        success: true,
        environment: {
            nodeEnv: process.env.NODE_ENV,
            port: PORT,
            vault: {
                id: process.env.VAULT_ACCOUNT_ID,
                name: process.env.VAULT_NAME
            },
            investor: {
                id: process.env.INVESTOR_ID
            },
            fireblocks: {
                hasApiKey: !!process.env.FIREBLOCKS_API_KEY,
                hasSecretKey: !!process.env.FIREBLOCKS_SECRET_KEY_PATH,
                baseUrl: process.env.FIREBLOCKS_BASE_URL,
                apiKeyPreview: process.env.FIREBLOCKS_API_KEY ? 
                    process.env.FIREBLOCKS_API_KEY.substring(0, 8) + '...' : 'missing'
            },
            wallets: {
                btc: process.env.BTC_WALLET_ADDRESS || 'not extracted',
                eth: process.env.ETH_WALLET_ADDRESS || 'not extracted',
                sol: process.env.SOL_WALLET_ADDRESS || 'not extracted'
            }
        }
    });
});

// Wallet extraction endpoint (FIXED)
app.post('/extract-wallets', async (req, res) => {
    try {
        const { vaultId, dryRun = false } = req.body;
        
        console.log('🔍 Starting wallet extraction via script...');
        console.log('Request body:', req.body);
        
        const args = [];
        if (vaultId) {
            args.push('--vault-id', vaultId);
        }
        if (dryRun) {
            args.push('--dry-run');
        }
        
        console.log('Script args:', args);
        
        // Execute the wallet extraction script
        const scriptPath = 'scripts/1-extract-wallets.js';
        console.log('Executing script:', scriptPath);
        
        const child = spawn('node', [scriptPath, ...args], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,
            cwd: process.cwd()
        });
        
        let stdout = '';
        let stderr = '';
        let scriptCompleted = false;
        
        // Set up timeout
        const timeout = setTimeout(() => {
            if (!scriptCompleted) {
                console.log('⏰ Script timeout, killing process...');
                child.kill();
                res.status(408).json({
                    success: false,
                    error: 'Script execution timeout (60 seconds)',
                    message: 'Wallet extraction took too long to complete'
                });
            }
        }, 60000); // 60 second timeout
        
        child.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            console.log('[SCRIPT STDOUT]:', output);
        });
        
        child.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            console.error('[SCRIPT STDERR]:', output);
        });
        
        child.on('close', (code) => {
            scriptCompleted = true;
            clearTimeout(timeout);
            
            console.log(`Script finished with exit code: ${code}`);
            
            const success = code === 0;
            
            // Try to parse any JSON output from the script
            let parsedOutput = null;
            try {
                // Look for JSON in the output
                const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsedOutput = JSON.parse(jsonMatch[0]);
                }
            } catch (e) {
                console.log('No valid JSON found in script output');
            }
            
            const response = {
                success,
                message: success ? 
                    'Wallet extraction completed successfully' : 
                    'Wallet extraction failed',
                exitCode: code,
                scriptOutput: stdout.trim(),
                errors: stderr.trim() || undefined,
                timestamp: new Date().toISOString(),
                parsedOutput: parsedOutput || undefined
            };
            
            // Add next steps based on success
            if (success) {
                response.nextSteps = [
                    'Check the script output above for extracted wallet addresses',
                    'Wallet addresses have been saved to .env file',
                    'Next: Create DID identity',
                    'Then: Create binding proofs'
                ];
            } else {
                response.troubleshooting = [
                    'Check the error output above',
                    'Verify Fireblocks configuration in .env',
                    'Make sure fireblock.pem file exists',
                    'Check vault ID is correct',
                    'Retry after fixing issues'
                ];
            }
            
            res.status(success ? 200 : 500).json(response);
        });
        
        child.on('error', (error) => {
            scriptCompleted = true;
            clearTimeout(timeout);
            
            console.error('Script execution error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                message: 'Failed to execute wallet extraction script',
                timestamp: new Date().toISOString()
            });
        });
        
    } catch (error) {
        console.error('Wallet extraction endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Internal server error during wallet extraction',
            timestamp: new Date().toISOString()
        });
    }
});

// Generic script runner endpoint
app.post('/run-script/:scriptName', async (req, res) => {
    try {
        const { scriptName } = req.params;
        const { args = [] } = req.body;
        
        const allowedScripts = [
            '1-extract-wallets',
            '2-create-did',
            '3-create-proofs',
            'test-wallet-extraction'
        ];
        
        if (!allowedScripts.includes(scriptName)) {
            return res.status(400).json({
                success: false,
                error: `Script '${scriptName}' is not allowed`,
                allowedScripts
            });
        }
        
        const scriptPath = `scripts/${scriptName}.js`;
        
        console.log(`🚀 Running script: ${scriptPath}`);
        
        // Execute the script
        const child = spawn('node', [scriptPath, ...args], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            stdout += data.toString();
            console.log(data.toString());
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(data.toString());
        });
        
        child.on('close', (code) => {
            const success = code === 0;
            
            res.json({
                success,
                scriptName,
                exitCode: code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                message: success ? 
                    `Script '${scriptName}' completed successfully` : 
                    `Script '${scriptName}' failed with exit code ${code}`,
                timestamp: new Date().toISOString()
            });
        });
        
        child.on('error', (error) => {
            console.error('Script execution error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                scriptName
            });
        });
        
    } catch (error) {
        console.error('Script runner error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Test Fireblocks connection (simple version)
app.get('/test-fireblocks', (req, res) => {
    const hasApiKey = !!process.env.FIREBLOCKS_API_KEY;
    const hasSecretKey = !!process.env.FIREBLOCKS_SECRET_KEY_PATH;
    const hasVaultId = !!process.env.VAULT_ACCOUNT_ID;
    
    const allConfigured = hasApiKey && hasSecretKey && hasVaultId;
    
    res.json({
        success: allConfigured,
        message: allConfigured ? 
            'Fireblocks configuration looks good' : 
            'Fireblocks configuration incomplete',
        checks: {
            apiKey: hasApiKey,
            secretKeyPath: hasSecretKey,
            vaultId: hasVaultId
        },
        nextStep: allConfigured ? 
            'Try POST /extract-wallets to test actual connection' :
            'Complete your .env configuration first'
    });
});

// Placeholder endpoints
app.post('/create-did', (req, res) => {
    res.json({
        message: 'DID creation endpoint',
        status: 'Coming soon - will create DID:ion identity',
        implementation: 'Will run scripts/2-create-did.js'
    });
});

app.post('/create-proofs', (req, res) => {
    res.json({
        message: 'Proof creation endpoint', 
        status: 'Coming soon - will create wallet binding proofs',
        implementation: 'Will run scripts/3-create-proofs.js'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        availableEndpoints: {
            'GET /': 'API information',
            'GET /health': 'Health check',
            'GET /test-fireblocks': 'Test Fireblocks configuration',
            'GET /env-info': 'Environment information',
            'POST /extract-wallets': 'Extract wallets from Fireblocks vault',
            'POST /run-script/:scriptName': 'Run any allowed script',
            'POST /create-did': 'Create DID identity (coming soon)',
            'POST /create-proofs': 'Create binding proofs (coming soon)'
        }
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Investor DID Server running on port ${PORT}`);
    console.log(`🔗 API Base: http://localhost:${PORT}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
    console.log(`🔗 Test Fireblocks: http://localhost:${PORT}/test-fireblocks`);
    console.log(`🔗 Environment Info: http://localhost:${PORT}/env-info`);
    console.log('');
    console.log('📋 Available Endpoints:');
    console.log('  GET  /health                    - Server health check');
    console.log('  GET  /test-fireblocks           - Test Fireblocks configuration');
    console.log('  GET  /env-info                  - Environment configuration');
    console.log('  POST /extract-wallets           - Extract wallets from vault');
    console.log('  POST /run-script/:scriptName    - Run any script');
    console.log('  POST /create-did                - Create DID identity (coming soon)');
    console.log('  POST /create-proofs             - Create binding proofs (coming soon)');
    console.log('');
    console.log('✅ Server ready! Your script files:');
    console.log('  📄 scripts/1-extract-wallets.js');
    console.log('  📄 scripts/2-create-did.js (create this next)');
    console.log('  📄 scripts/3-create-proofs.js (create this next)');
    console.log('');
    console.log('🎯 Quick Test Commands:');
    console.log('  curl http://localhost:3000/health');
    console.log('  curl http://localhost:3000/test-fireblocks');
    console.log('  curl -X POST http://localhost:3000/extract-wallets');
});

export default app;