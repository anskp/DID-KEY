import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ANSI colors for nicer logs
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

const PINATA_ENDPOINT = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const IMAGES_DIR = './images';

function validatePinataJWT() {
  if (!process.env.PINATA_JWT) {
    console.error(`${colors.red}❌ PINATA_JWT token not found in .env${colors.reset}`);
    console.log(`${colors.yellow}➡️  Obtain a JWT from Pinata and add:\nPINATA_JWT=<your_token> to your .env file${colors.reset}`);
    process.exit(1);
  }
  console.log(`${colors.green}✅ Using Pinata JWT authentication${colors.reset}`);
}

function discoverImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`${colors.red}❌ Images directory not found: ${IMAGES_DIR}${colors.reset}`);
    process.exit(1);
  }
  const files = fs.readdirSync(IMAGES_DIR)
    .filter(f => /\.(png|jpe?g|gif|webp|bmp)$/i.test(f));

  if (files.length === 0) {
    console.error(`${colors.red}❌ No image files found in ${IMAGES_DIR}${colors.reset}`);
    process.exit(1);
  }
  console.log(`${colors.cyan}${colors.bright}📸 Found ${files.length} image(s):${colors.reset}\n - ${files.join('\n - ')}`);
  return files.map(f => path.join(IMAGES_DIR, f));
}

async function uploadImageToPinata(imagePath) {
  const fileStream = fs.createReadStream(imagePath);
  const data = new FormData();
  data.append('file', fileStream);

  // Metadata
  const fileName = path.basename(imagePath);
  data.append('pinataMetadata', JSON.stringify({
    name: fileName,
    keyvalues: {
      purpose: 'did_for_investors_image',
      originalName: fileName,
      uploadedAt: new Date().toISOString()
    }
  }));
  // Options
  data.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const headers = {
    ...data.getHeaders(),
    Authorization: `Bearer ${process.env.PINATA_JWT}`
  };

  console.log(`\n⏫ Uploading ${fileName} to IPFS...`);
  const start = Date.now();
  const resp = await axios.post(PINATA_ENDPOINT, data, { headers });
  const ms = Date.now() - start;

  if (resp.data && resp.data.IpfsHash) {
    console.log(`${colors.green}✅ Uploaded ${fileName}: ${resp.data.IpfsHash} (${ms} ms)${colors.reset}`);
    return resp.data.IpfsHash;
  }
  throw new Error(`Invalid response from Pinata for ${fileName}`);
}

function envVarNameFromFile(file) {
  const name = path.parse(file).name; // e.g., image1
  return `${name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_CID`;
}

function updateEnv(vars) {
  let envContent = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
      console.log(`🔄 Updated ${key} in .env`);
    } else {
      envContent += `${envContent.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
      console.log(`➕ Added ${key} to .env`);
    }
  }
  fs.writeFileSync('.env', envContent);
  console.log(`${colors.green}✅ .env updated with image CIDs${colors.reset}`);
}

async function main() {
  console.log(`${colors.cyan}${colors.bright}🖼️  IMAGE → IPFS UPLOADER${colors.reset}`);
  validatePinataJWT();

  const imagePaths = discoverImages();
  const envUpdates = {};

  for (const imgPath of imagePaths) {
    try {
      const cid = await uploadImageToPinata(imgPath);
      const varName = envVarNameFromFile(imgPath);
      envUpdates[varName] = cid;
    } catch (err) {
      console.error(`${colors.red}❌ Failed to upload ${imgPath}:${colors.reset} ${err.message}`);
    }
  }

  if (Object.keys(envUpdates).length > 0) {
    updateEnv(envUpdates);
  } else {
    console.log(`${colors.yellow}⚠️  No images were uploaded successfully. .env not modified.${colors.reset}`);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => {
    console.error(`${colors.red}❌ Unexpected error:${colors.reset}`, err);
    process.exit(1);
  });
} 