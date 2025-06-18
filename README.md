# DID-FOR-INVESTORS / DID-KEY

A complete reference implementation that demonstrates how to create, anchor, and verify **Decentralised Identifiers (DIDs)** for investment use-cases on EVM chains.

The repository contains:

* **JavaScript utilities** that prepare wallet data, upload metadata to IPFS, and generate fresh `did:key` identifiers.
* **Hardhat smart-contract workspace** used to deploy a *Simplified Multi-Chain DID Registry* (and an optional full Multi-Chain variant).
* **Verification helpers** for proving DID registration on-chain.
* **Fireblocks integration** so transactions can be signed securely by an MPC wallet.

> The code has been extracted from a larger PoC and focuses on the **minimal set of tools** needed to reproduce the DID life-cycle end-to-end.

---

## 1. Quick Start

```bash
# Clone your fork (skip if you already have the working copy)
$ git clone https://github.com/anskp/DID-KEY.git && cd DID-KEY

# Install all Node dependencies
$ npm ci

# Copy the example env file and fill in the blanks
$ cp .env.example .env
```

Now follow the walkthrough in **section 3** to run each step.

---

## 2. Prerequisites

1. **Node.js v18+** and **npm** (or **pnpm/yarn**).
2. **Hardhat** is installed locally through `devDependencies`.
3. A funded **EVM account / Fireblocks workspace** capable of paying gas on the target chain (defaults to Polygon Amoy).
4. `jq` (optional) for inspecting JSON artefacts generated under `data/`.

---

## 3. Workflow Scripts

All top-level scripts live in `scripts/` and are meant to be executed sequentially. Each script persists its output under `data/` so it can be reused by later steps.

| # | Script | Purpose |
|---|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| 1 | `1-extract-wallets.js` | Reads a **Fireblocks** workspace, extracts all wallet addresses and stores them in `data/wallet-<timestamp>.json`. |
| 2 | `2-upload-to-ipfs.js` | Takes the JSON produced by (1), packs it into an IPFS CAR file and uploads it to the configured **Pinata**/`api.ipfs.tech` gateway. |
| 3 | `3-generate-did-key.js` | Generates a fresh `did:key` for each wallet, producing both **public DID documents** and **private JWKs**. |

After generating the keys you can jump into the smart-contract workspace:

```bash
$ cd smart-contracts
```

### Smart-Contract Scripts (`smart-contracts/scripts/`)

| Script | What it does |
|-------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `deploy-simplified-registry.js` | Deploys **SimplifiedMultiChainDIDRegistry.sol** – ideal for low-cost testnets. The address is written to `data/contract-deployment-<timestamp>.json`. |
| `deploy-multichain-registry.js` | Deploys the full **MultiChainDIDRegistry.sol** (inherits OpenZeppelin `Ownable`). |
| `generate-multichain-proofs.js` | Generates EIP-712 proofs that allow an off-chain wallet to authorise the registry to anchor a DID on its behalf. |
| `register-did-multichain.js` | Calls the registry’s `registerDID(bytes)` function, passing the DID document & EIP-712 signature. Stores tx details in `data/did-registration-<timestamp>.json`. |
| `verify-did-registration.js` | Reads the on-chain event log and reconstructs the DID document hash to ensure the registration is valid. |

> Every script accepts `--network <name>` so you can target local `hardhat`, `amoy`, `mumbai`, etc.

---

## 4. Environment Variables (`.env`)

Create a `.env` file at the project root with the following keys:

```dotenv
# RPC endpoints
env_ETH_ENDPOINT="https://polygon-amoy.infura.io/v3/<API_KEY>"

# Private key or Fireblocks API creds
PRIVATE_KEY="0x..."          # used by Hardhat local signer
FIREBLOCKS_API_KEY="..."     # only needed for Fireblocks flows
FIREBLOCKS_API_SECRET="..."
FIREBLOCKS_VAULT_ID="..."

# IPFS
PINATA_JWT="eyJhbGci..."
```

> Never commit your real secrets – the `.gitignore` already excludes `.env`.

---

## 5. Typical End-to-End Run (Polygon Amoy)

```bash
# 1. Wallet discovery
$ node scripts/1-extract-wallets.js --workspace <FIREBLOCKS_WS_ID>

# 2. Upload to IPFS
$ node scripts/2-upload-to-ipfs.js --input data/wallet-*.json

# 3. Generate did:key docs
$ node scripts/3-generate-did-key.js

# 4. Deploy registry (inside smart-contracts)
$ cd smart-contracts
$ npx hardhat run scripts/deploy-simplified-registry.js --network amoy

# 5. Register DIDs
$ npx hardhat run scripts/register-did-multichain.js --network amoy

# 6. Verify
$ npx hardhat run scripts/verify-did-registration.js --network amoy
```

You will find all intermediate artefacts under `data/` – handy for audits and debugging.

---

## 6. Testing

A minimal Hardhat test suite is provided:

```bash
$ cd smart-contracts
$ npx hardhat test
```

---

## 7. Project Structure (High-Level)

```
.
├── data/                     # Script outputs and cached artefacts
├── scripts/                  # Off-chain helper scripts (Node.js)
├── smart-contracts/          # Hardhat workspace
│   ├── contracts/            # Solidity sources
│   ├── scripts/              # Deployment & interaction helpers
│   ├── test/                 # Mocha + Chai tests
│   └── hardhat.config.js     # Hardhat config
├── src/                      # Reusable JS libs (Fireblocks, logger, …)
└── README.md
```

---

## 8. Important Gotchas

1. **Nonce management** – Fireblocks queues txns; make sure the indexer is in sync.
2. **Gas limits** – The simplified registry is lightweight but the full registry consumes ~2.3 M gas on Amoy.
3. **IPFS rate-limits** – consider Pinata or Filebase if you upload many files.

---

## 9. Licence

MIT – see `LICENCE` file.
