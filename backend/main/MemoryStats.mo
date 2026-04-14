import Nat "mo:base/Nat";
import Buffer "mo:base/Buffer";
import TrieMap "mo:base/TrieMap";
import Iter "mo:base/Iter";

module {
  public type StructureStats = {
    count : Nat;
    bytes : Nat;
  };

  public type MemoryStats = {
    rtsHeapSize : Nat;
    rtsMemorySize : Nat;

    packageVersions : StructureStats;
    packageConfigs : StructureStats;
    highestConfigs : StructureStats;
    packagePublications : StructureStats;
    ownersByPackage : StructureStats;
    maintainersByPackage : StructureStats;
    fileIdsByPackage : StructureStats;
    hashByFileId : StructureStats;
    packageFileStats : StructureStats;
    packageTestStats : StructureStats;
    packageBenchmarks : StructureStats;
    packageNotes : StructureStats;
    packageDocsCoverage : StructureStats;

    downloadsByPackageName : StructureStats;
    downloadsByPackageId : StructureStats;
    dailySnapshots : StructureStats;
    weeklySnapshots : StructureStats;
    dailySnapshotsByPackageName : StructureStats;
    dailySnapshotsByPackageId : StructureStats;
    weeklySnapshotsByPackageName : StructureStats;
    weeklySnapshotsByPackageId : StructureStats;
    dailyTempRecords : StructureStats;
    weeklyTempRecords : StructureStats;

    storages : StructureStats;
    storageByFileId : StructureStats;

    users : StructureStats;
    names : StructureStats;
  };

  public let SAMPLE_SIZE : Nat = 1_000;

  // Serializes a systematic sample of up to SAMPLE_SIZE elements from an
  // iterator and extrapolates the total byte count, keeping to_candid
  // allocations bounded.
  public func sampleIterBytes<V>(
    iter : Iter.Iter<V>,
    total : Nat,
    serialize : V -> Blob,
  ) : Nat {
    if (total == 0) return 0;
    let stride = if (total <= SAMPLE_SIZE) 1 else (total + SAMPLE_SIZE - 1 : Nat) / SAMPLE_SIZE;
    var sum = 0;
    var i = 0;
    var sampled = 0;
    label sampleLoop for (v in iter) {
      if (sampled >= SAMPLE_SIZE) break sampleLoop;
      if (i % stride == 0) {
        sum += serialize(v).size();
        sampled += 1;
      };
      i += 1;
    };
    if (sampled == 0) 0 else sum * total / sampled;
  };

  // Two-level sampling for TrieMaps whose values are Buffers.
  // Budgets to_candid calls across both keys and their inner elements.
  public func sampleMapOfBuffersBytes<K, V>(
    map : TrieMap.TrieMap<K, Buffer.Buffer<V>>,
    serialize : V -> Blob,
  ) : Nat {
    let total = map.size();
    if (total == 0) return 0;
    let numSampledKeys = Nat.min(total, SAMPLE_SIZE);
    let perKeyBudget = Nat.max(1, SAMPLE_SIZE / numSampledKeys);
    let stride = if (total <= SAMPLE_SIZE) 1 else (total + SAMPLE_SIZE - 1 : Nat) / SAMPLE_SIZE;
    var sum = 0;
    var i = 0;
    var sampled = 0;
    label sampleLoop for ((_, buf) in map.entries()) {
      if (sampled >= SAMPLE_SIZE) break sampleLoop;
      if (i % stride == 0) {
        let bufTotal = buf.size();
        if (bufTotal > 0) {
          let bufStride = if (bufTotal <= perKeyBudget) 1 else (bufTotal + perKeyBudget - 1 : Nat) / perKeyBudget;
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

  // Convenience: returns { count; bytes } for a TrieMap.
  public func statsForMap<K, V>(
    map : TrieMap.TrieMap<K, V>,
    serialize : (K, V) -> Blob,
  ) : StructureStats {
    let total = map.size();
    {
      count = total;
      bytes = sampleIterBytes(
        map.entries(),
        total,
        func((k, v) : (K, V)) : Blob = serialize(k, v),
      );
    };
  };

  // Convenience: returns { count; bytes } for a Buffer.
  public func statsForBuffer<V>(
    buf : Buffer.Buffer<V>,
    serialize : V -> Blob,
  ) : StructureStats {
    {
      count = buf.size();
      bytes = sampleIterBytes(buf.vals(), buf.size(), serialize);
    };
  };

  // Convenience: returns { count; bytes } for an arbitrary Iter + known size.
  public func statsForIter<V>(
    iter : Iter.Iter<V>,
    total : Nat,
    serialize : V -> Blob,
  ) : StructureStats {
    { count = total; bytes = sampleIterBytes(iter, total, serialize) };
  };

  // Convenience: returns { count; bytes } for a TrieMap<K, Buffer<V>>.
  public func statsForMapOfBuffers<K, V>(
    map : TrieMap.TrieMap<K, Buffer.Buffer<V>>,
    serialize : V -> Blob,
  ) : StructureStats {
    { count = map.size(); bytes = sampleMapOfBuffersBytes(map, serialize) };
  };
};
