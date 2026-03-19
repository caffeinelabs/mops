module {
  // legacy, use keywords for new packages
  public let packagesByCategory = [
    {
      title = "Data Structures";
      keywords = ["data-structure", "datastructure", "array", "map", "list", "buffer"];
      legacyNames = [
        "bitbuffer",
        "enumeration",
        "buffer-deque",
        "stableheapbtreemap",
        "swb",
        "vector",
        "circular-buffer",
        "splay",
        "linked-list",
        "map",
        "merkle-patricia-trie",
        "memory-buffer",
        "augmented-btrees",
        "stable-enum",
        "stable-buffer",
        "memory-hashtable",
      ];
    },
    {
      title = "Utilities";
      keywords = ["util", "utility", "utils", "utilities", "helper"];
      legacyNames = [
        "datetime",
        "itertools",
        "xtended-text",
        "xtended-numbers",
        "prng",
        "fuzz",
        "test",
        "time-consts",
        "memory-region",
        "account",
        "bench",
        "random-class",
        "time",
      ];
    },
    {
      title = "Encoding";
      keywords = ["encoding", "decoding", "serialization", "deserialization", "serialize", "deserialize", "encoder", "decoder", "encode", "decode", "parse", "parser", "stringfy", "json", "cbor", "candid"];
      legacyNames = [
        "deflate",
        "serde",
        "xml",
        "cbor",
        "candy",
        "candid",
        "rep-indy-hash",
      ];
    },
    {
      title = "Cryptography";
      keywords = ["crypto", "hash", "encryption", "encrypt", "signature", "cryptography", "cryptographic", "decryption", "hashing", "signing", "verify", "verification"];
      legacyNames = [
        "sha2",
        "sha3",
        "libsecp256k1",
        "merkle-patricia-trie",
        "evm-txs",
        "ic-certification",
        "evm-proof-verifier",
      ];
    },
    {
      title = "Types/Interfaces";
      keywords = ["types", "interface", "service"];
      legacyNames = [
        "ic",
        "ledger-types",
        "ckbtc-types",
        "http-types",
        "canistergeek",
        "icrc1",
        "origyn-nft",
        "kyc",
        "xrc-types",
        "promtracker",
        "devefi-icrc-ledger",
        "devefi-icrc-sender",
        "devefi-icrc-reader",
        "devefi-icp-ledger",
        "icrc1-types",
        "icrc2-types",
      ];
    },
    {
      title = "HTTP";
      keywords = ["http", "server", "web", "websocket", "https", "http-server", "http-client", "web-server", "web-client"];
      legacyNames = [
        "certified-http",
        "certified-cache",
        "ic-certification",
        "assets",
        "server",
        "http-parser",
        "web-io",
        "http-types",
        "motoko-certified-assets",
        "promtracker",
        "certified-assets",
        "ic-websocket-cdk",
      ];
    },
    {
      title = "DeFi";
      keywords = ["defi", "exchange", "swap", "token", "tokens", "coin", "lend", "pool", "liquidity", "pair"];
      legacyNames = [
        "icrc1",
        "auction",
        "account",
        "devefi-icrc-sender",
        "devefi-icrc-reader",
        "icrc1-types",
        "icrc2-types",
        "account-identifier",
      ];
    },
    {
      title = "AI";
      keywords = ["ai", "llm", "mcp"];
      legacyNames = [];
    },
    {
      title = "Chain Fusion";
      keywords = ["chain-fusion", "threshold", "chain-key", "btc", "bitcoin", "eth", "evm", "ethereum", "sol", "solana"];
      legacyNames = ["merkle-patricia-trie", "ckbtc-types"];
    },
    {
      title = "ICRC";
      keywords = ["icrc"];
      legacyNames = [
        "icrc1",
        "origyn-nft",
        "account",
        "icrc3-mo",
        "icrc7-mo",
        "icrc30-mo",
        "icrc-nft-mo",
        "icrc1-mo",
        "icrc2-mo",
        "icrc-fungible",
        "icrc4-mo",
        "devefi-icrc-ledger",
        "devefi-icrc-sender",
        "devefi-icrc-reader",
        "icrc1-types",
        "icrc2-types",
        "account-identifier",
      ];
    },
    {
      title = "Async Data Flow";
      keywords = ["async", "data-flow", "dataflow", "stream", "streams", "channel", "channels", "actor", "actors", "message", "messages"];
      legacyNames = [
        "star",
        "maf",
        "rxmo",
      ];
    },
    {
      title = "Databases";
      keywords = ["database", "db", "storage", "store", "persistence"];
      legacyNames = [
        "candb",
        "rxmodb",
        "nacdb",
      ];
    },
    {
      title = "Stable Memory";
      keywords = ["stable-memory", "memory", "region", "persistent"];
      legacyNames = [
        "memory-region",
        "memory-buffer",
        "stable-enum",
        "stable-buffer",
        "memory-hashtable",
      ];
    },
  ];
};
