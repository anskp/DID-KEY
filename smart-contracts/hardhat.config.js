require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("./scripts/check-sbt-mint.js");

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || (process.env.ALCHEMY_API_KEY ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}` : "https://eth-sepolia.g.alchemy.com/v2/demo");
const PRIVATE_KEY = process.env.DEPLOYMENT_PRIVATE_KEY || process.env.PRIVATE_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  },
  etherscan: {
    apiKey: "YourEtherscanAPIKey" // Optional: for contract verification
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};