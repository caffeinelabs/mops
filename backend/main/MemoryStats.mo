import Nat "mo:base/Nat";
import Buffer "mo:base/Buffer";
import TrieMap "mo:base/TrieMap";
import Iter "mo:base/Iter";

module {
  public type StructureStats = {
    count : Nat;
    bytes : Nat;
  };

  public let SAMPLE_SIZE : Nat = 1_000;

  // Serializes a random sample of up to SAMPLE_SIZE entries from a TrieMap
  // and extrapolates the total byte count, keeping to_candid allocations bounded.
  public func sampleMapBytes<K, V>(
    map : TrieMap.TrieMap<K, V>,
    serialize : (K, V) -> Blob,
  ) : Nat {
    let total = map.size();
    if (total == 0) return 0;
    let stride = if (total <= SAMPLE_SIZE) 1 else (total + SAMPLE_SIZE - 1) / SAMPLE_SIZE;
    var sum = 0;
    var i = 0;
    var sampled = 0;
    label sampleLoop for ((k, v) in map.entries()) {
      if (sampled >= SAMPLE_SIZE) break sampleLoop;
      if (i % stride == 0) {
        sum += serialize(k, v).size();
        sampled += 1;
      };
      i += 1;
    };
    sum * total / sampled;
  };

  // Serializes a random sample of up to SAMPLE_SIZE elements from a Buffer.
  public func sampleBufferBytes<V>(
    buf : Buffer.Buffer<V>,
    serialize : V -> Blob,
  ) : Nat {
    let total = buf.size();
    if (total == 0) return 0;
    let stride = if (total <= SAMPLE_SIZE) 1 else (total + SAMPLE_SIZE - 1) / SAMPLE_SIZE;
    var sum = 0;
    var i = 0;
    var sampled = 0;
    label sampleLoop for (v in buf.vals()) {
      if (sampled >= SAMPLE_SIZE) break sampleLoop;
      if (i % stride == 0) {
        sum += serialize(v).size();
        sampled += 1;
      };
      i += 1;
    };
    sum * total / sampled;
  };

  // Serializes a random sample of up to SAMPLE_SIZE elements from any iterator.
  // Useful for collections (e.g. Set) that expose an Iter but not a size method.
  public func sampleIterBytes<V>(
    iter : Iter.Iter<V>,
    total : Nat,
    serialize : V -> Blob,
  ) : Nat {
    if (total == 0) return 0;
    let stride = if (total <= SAMPLE_SIZE) 1 else (total + SAMPLE_SIZE - 1) / SAMPLE_SIZE;
    var sum = 0;
    var i = 0;
    var sampled = 0;
    label sampleLoop loop {
      switch (iter.next()) {
        case (null) break sampleLoop;
        case (?v) {
          if (sampled >= SAMPLE_SIZE) break sampleLoop;
          if (i % stride == 0) {
            sum += serialize(v).size();
            sampled += 1;
          };
          i += 1;
        };
      };
    };
    if (sampled == 0) 0 else sum * total / sampled;
  };

  // Serializes a random sample of up to SAMPLE_SIZE entries from a TrieMap
  // whose values are Buffers, budgeting to_candid calls across both keys and
  // their inner elements so the total stays bounded.
  public func sampleMapOfBuffersBytes<K, V>(
    map : TrieMap.TrieMap<K, Buffer.Buffer<V>>,
    serialize : V -> Blob,
  ) : Nat {
    let total = map.size();
    if (total == 0) return 0;
    let numSampledKeys = Nat.min(total, SAMPLE_SIZE);
    let perKeyBudget = Nat.max(1, SAMPLE_SIZE / numSampledKeys);
    let stride = if (total <= SAMPLE_SIZE) 1 else (total + SAMPLE_SIZE - 1) / SAMPLE_SIZE;
    var sum = 0;
    var i = 0;
    var sampled = 0;
    label sampleLoop for ((_, buf) in map.entries()) {
      if (sampled >= SAMPLE_SIZE) break sampleLoop;
      if (i % stride == 0) {
        let bufTotal = buf.size();
        if (bufTotal > 0) {
          let bufStride = if (bufTotal <= perKeyBudget) 1 else (bufTotal + perKeyBudget - 1) / perKeyBudget;
          var j = 0;
          var bufSum = 0;
          var bufSampled = 0;
          while (j < bufTotal and bufSampled < perKeyBudget) {
            bufSum += serialize(buf.get(j)).size();
            bufSampled += 1;
            j += bufStride;
          };
          sum += bufSum * bufTotal / bufSampled;
        };
        sampled += 1;
      };
      i += 1;
    };
    if (sampled == 0) return 0;
    sum * total / sampled;
  };
};
