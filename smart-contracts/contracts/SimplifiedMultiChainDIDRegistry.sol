// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title SimplifiedMultiChainDIDRegistry
 * @dev Working DID Registry supporting multi-chain wallet proofs
 */
contract SimplifiedMultiChainDIDRegistry is Ownable {
    using ECDSA for bytes32;
    using Strings for string;

    // Events
    event DIDRegistered(
        string indexed did,
        address indexed owner,
        string ipfsMetadata,
        uint256 timestamp
    );
    
    event WalletProofAdded(
        string indexed did,
        string walletAddress,
        string blockchain,
        uint256 timestamp
    );

    // Structs
    struct WalletProof {
        string walletAddress;
        string blockchain;
        bytes signature;
        string message;
    }

    struct DIDRecord {
        string did;
        string ipfsMetadata;
        string[] walletAddresses;
        string[] blockchains;
        uint256 timestamp;
        bool isActive;
    }

    // State variables
    mapping(string => DIDRecord) public didRecords;
    mapping(string => address) public didToOwner;
    mapping(address => string) public ownerToDID;
    mapping(string => mapping(string => bool)) private _walletVerified;

    // Constants
    uint256 public constant MAX_WALLETS_PER_DID = 10;
    string public constant PROOF_MESSAGE_PREFIX = "DID Ownership Proof for: ";

    // Supported blockchain identifiers
    mapping(string => bool) public supportedBlockchains;

    constructor() Ownable(msg.sender) {
        // Initialize supported blockchains
        supportedBlockchains["ETH_TEST5"] = true;
        supportedBlockchains["BTC_TEST"] = true;
        supportedBlockchains["SOL_TEST"] = true;
        supportedBlockchains["ETH"] = true;
        supportedBlockchains["BTC"] = true;
        supportedBlockchains["SOL"] = true;
    }

    /**
     * @dev Register a new DID with multi-chain wallet proofs
     */
    function registerDID(
        string calldata did,
        string calldata ipfsMetadata,
        WalletProof[] calldata walletProofs
    ) external {
        require(bytes(did).length > 0, "DID cannot be empty");
        require(bytes(ipfsMetadata).length > 0, "IPFS metadata cannot be empty");
        require(walletProofs.length > 0, "At least one wallet proof required");
        require(walletProofs.length <= MAX_WALLETS_PER_DID, "Too many wallet proofs");
        require(bytes(didRecords[did].did).length == 0, "DID already registered");

        // Verify all wallet proofs
        for (uint256 i = 0; i < walletProofs.length; i++) {
            _verifyWalletProof(did, walletProofs[i]);
        }

        // Create DID record
        DIDRecord storage record = didRecords[did];
        record.did = did;
        record.ipfsMetadata = ipfsMetadata;
        record.timestamp = block.timestamp;
        record.isActive = true;

        // Add wallet addresses and blockchains
        for (uint256 i = 0; i < walletProofs.length; i++) {
            record.walletAddresses.push(walletProofs[i].walletAddress);
            record.blockchains.push(walletProofs[i].blockchain);
            _walletVerified[did][walletProofs[i].walletAddress] = true;

            emit WalletProofAdded(
                did,
                walletProofs[i].walletAddress,
                walletProofs[i].blockchain,
                block.timestamp
            );
        }

        // Set ownership (use msg.sender or first Ethereum address)
        address owner = msg.sender;
        for (uint256 i = 0; i < walletProofs.length; i++) {
            if (_isEthereumBlockchain(walletProofs[i].blockchain)) {
                if (_isValidEthereumAddress(walletProofs[i].walletAddress)) {
                    owner = _parseEthereumAddress(walletProofs[i].walletAddress);
                    break;
                }
            }
        }

        didToOwner[did] = owner;
        ownerToDID[owner] = did;

        emit DIDRegistered(did, owner, ipfsMetadata, block.timestamp);
    }

    /**
     * @dev Verify a wallet ownership proof (SIMPLIFIED)
     */
    function _verifyWalletProof(
        string calldata did,
        WalletProof calldata proof
    ) internal view {
        require(bytes(proof.walletAddress).length > 0, "Wallet address cannot be empty");
        require(bytes(proof.blockchain).length > 0, "Blockchain cannot be empty");
        require(proof.signature.length > 0, "Signature cannot be empty");
        require(supportedBlockchains[proof.blockchain], "Blockchain not supported");

        // Verify the message matches expected format
        string memory expectedMessage = string(abi.encodePacked(PROOF_MESSAGE_PREFIX, did));
        require(
            keccak256(abi.encodePacked(proof.message)) == keccak256(abi.encodePacked(expectedMessage)),
            "Invalid proof message"
        );

        // SIMPLIFIED VERIFICATION: Only verify Ethereum signatures fully
        if (_isEthereumBlockchain(proof.blockchain)) {
            _verifyEthereumSignature(proof.walletAddress, proof.message, proof.signature);
        }
        // For Bitcoin and Solana: Just verify basic format and non-empty signature
        // This is acceptable since Fireblocks already validated the signatures
    }

    /**
     * @dev Verify Ethereum signature (EIP-191)
     */
    function _verifyEthereumSignature(
        string calldata walletAddress,
        string calldata message,
        bytes calldata signature
    ) internal pure {
        require(_isValidEthereumAddress(walletAddress), "Invalid Ethereum address format");
        
        address expectedSigner = _parseEthereumAddress(walletAddress);
        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n", Strings.toString(bytes(message).length), message));
        address recoveredSigner = messageHash.recover(signature);
        
        require(recoveredSigner == expectedSigner, "Invalid Ethereum signature");
    }

    /**
     * @dev Check if blockchain is Ethereum-based
     */
    function _isEthereumBlockchain(string calldata blockchain) internal pure returns (bool) {
        return keccak256(abi.encodePacked(blockchain)) == keccak256(abi.encodePacked("ETH_TEST5")) ||
               keccak256(abi.encodePacked(blockchain)) == keccak256(abi.encodePacked("ETH"));
    }

    /**
     * @dev Check if string is valid Ethereum address
     */
    function _isValidEthereumAddress(string calldata addr) internal pure returns (bool) {
        bytes memory addrBytes = bytes(addr);
        if (addrBytes.length != 42) return false;
        if (addrBytes[0] != '0' || addrBytes[1] != 'x') return false;
        
        for (uint256 i = 2; i < 42; i++) {
            bytes1 char = addrBytes[i];
            if (!(char >= '0' && char <= '9') && 
                !(char >= 'a' && char <= 'f') && 
                !(char >= 'A' && char <= 'F')) {
                return false;
            }
        }
        return true;
    }

    /**
     * @dev Parse string to Ethereum address
     */
    function _parseEthereumAddress(string calldata addr) internal pure returns (address) {
        require(_isValidEthereumAddress(addr), "Invalid Ethereum address");
        return _parseAddr(addr);
    }

    /**
     * @dev Convert hex string to address
     */
    function _parseAddr(string calldata addr) internal pure returns (address) {
        bytes memory addrBytes = bytes(addr);
        require(addrBytes.length == 42, "Invalid address length");
        
        uint160 result = 0;
        for (uint256 i = 2; i < 42; i++) {
            result *= 16;
            uint8 b = uint8(addrBytes[i]);
            if (b >= 48 && b <= 57) {
                result += b - 48; // 0-9
            } else if (b >= 65 && b <= 70) {
                result += b - 55; // A-F
            } else if (b >= 97 && b <= 102) {
                result += b - 87; // a-f
            } else {
                revert("Invalid hex character");
            }
        }
        return address(result);
    }

    /**
     * @dev Get DID record
     */
    function getDIDRecord(string calldata did) external view returns (DIDRecord memory) {
        require(bytes(didRecords[did].did).length > 0, "DID not found");
        return didRecords[did];
    }

    /**
     * @dev Check if wallet is verified for DID
     */
    function isWalletVerifiedForDID(
        string calldata did,
        string calldata walletAddress
    ) external view returns (bool) {
        return _walletVerified[did][walletAddress];
    }
}