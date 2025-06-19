// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SBT - Soulbound Token for Verifiable Credentials
 * @dev Non-transferable NFT that stores VC hashes with upgrade capability
 * @dev Compatible with OpenZeppelin v5.0+
 */
contract SBT is ERC721, ERC721URIStorage, Ownable {
    
    // Token ID counter (replaces Counters.sol)
    uint256 private _tokenIdCounter;
    
    // VC hash history per token (supports upgrades)
    mapping(uint256 => bytes32[]) public vcHashes;
    
    // Token metadata
    mapping(uint256 => address) public tokenHolder;
    mapping(address => uint256) public holderToken; // One SBT per address
    mapping(uint256 => string) public tokenDID;
    
    // Events
    event SBTMinted(uint256 indexed tokenId, address indexed holder, string did, bytes32 vcHash);
    event VCHashUpdated(uint256 indexed tokenId, bytes32 indexed oldHash, bytes32 indexed newHash);
    event VCHashRegistered(uint256 indexed tokenId, bytes32 indexed vcHash, uint256 hashCount);
    
    constructor() ERC721("InvestorCredentialSBT", "ICSBT") Ownable(_msgSender()) {}
    
    /**
     * @dev Mint SBT with initial VC hash
     */
    function mintSBT(
        address to, 
        string memory did,
        string memory uri,  // RENAMED to avoid shadowing
        bytes32 vcHash
    ) external onlyOwner returns (uint256) {
        require(to != address(0), "SBT: cannot mint to zero address");
        require(holderToken[to] == 0, "SBT: address already has SBT");
        require(vcHash != bytes32(0), "SBT: VC hash cannot be empty");
        require(bytes(did).length > 0, "SBT: DID cannot be empty");
        
        // Increment token ID counter
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;
        
        // Mint the soulbound token
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        
        // Store metadata
        tokenHolder[tokenId] = to;
        holderToken[to] = tokenId;
        tokenDID[tokenId] = did;
        
        // Register initial VC hash
        vcHashes[tokenId].push(vcHash);
        
        emit SBTMinted(tokenId, to, did, vcHash);
        emit VCHashRegistered(tokenId, vcHash, 1);
        
        return tokenId;
    }
    
    /**
     * @dev Register new VC hash for existing SBT (for KYC updates)
     */
    function registerVC(uint256 tokenId, bytes32 newVCHash) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "SBT: token does not exist");
        require(newVCHash != bytes32(0), "SBT: VC hash cannot be empty");
        
        bytes32 oldHash = bytes32(0);
        if (vcHashes[tokenId].length > 0) {
            oldHash = vcHashes[tokenId][vcHashes[tokenId].length - 1];
        }
        
        vcHashes[tokenId].push(newVCHash);
        
        emit VCHashUpdated(tokenId, oldHash, newVCHash);
        emit VCHashRegistered(tokenId, newVCHash, vcHashes[tokenId].length);
    }
    
    /**
     * @dev Update token URI (when VC metadata is updated)
     */
    function updateTokenURI(uint256 tokenId, string memory newTokenURI) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "SBT: token does not exist");
        _setTokenURI(tokenId, newTokenURI);
    }
    
    /**
     * @dev Get latest VC hash for a token
     */
    function getLatestVC(uint256 tokenId) external view returns (bytes32) {
        require(_ownerOf(tokenId) != address(0), "SBT: token does not exist");
        uint256 len = vcHashes[tokenId].length;
        require(len > 0, "SBT: no VC found");
        return vcHashes[tokenId][len - 1];
    }
    
    /**
     * @dev Get all VC hashes for a token
     */
    function getAllVCHashes(uint256 tokenId) external view returns (bytes32[] memory) {
        require(_ownerOf(tokenId) != address(0), "SBT: token does not exist");
        return vcHashes[tokenId];
    }
    
    /**
     * @dev Get VC hash count for a token
     */
    function getVCHashCount(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "SBT: token does not exist");
        return vcHashes[tokenId].length;
    }
    
    /**
     * @dev Get SBT info for an address
     */
    function getSBTInfo(address holder) external view returns (
        uint256 tokenId, 
        string memory did, 
        bytes32 latestVCHash
    ) {
        tokenId = holderToken[holder];
        if (tokenId == 0) {
            return (0, "", bytes32(0));
        }
        
        did = tokenDID[tokenId];
        
        if (vcHashes[tokenId].length > 0) {
            latestVCHash = vcHashes[tokenId][vcHashes[tokenId].length - 1];
        }
        
        return (tokenId, did, latestVCHash);
    }
    
    /**
     * @dev Get total supply of SBTs
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }
    
    /**
     * @dev Override _update function to make tokens soulbound (v5.0 way)
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0)) and burning (to == address(0))
        // Reject all transfers between non-zero addresses
        if (from != address(0) && to != address(0)) {
            revert("SBT: soulbound tokens are non-transferable");
        }
        
        return super._update(to, tokenId, auth);
    }
    
    // Required overrides for multiple inheritance (v5.0 syntax)
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}