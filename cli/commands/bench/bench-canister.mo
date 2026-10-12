import Nat "mo:core/Nat";
import Runtime "mo:core/Runtime";
import InternetComputer "mo:core/InternetComputer";
// Calls to `core` functions taking `self` go through `mo:prim`: module-style
// they trip M0236 under a user `-E=M0236`, and dot notation needs core 2.x.
import Prim "mo:prim";

import UserBench "./user-bench"; // file path will be replaced with the *.bench.mo file path

persistent actor class () {
  type BenchSchema = {
    name : Text;
    description : Text;
    rows : [Text];
    cols : [Text];
  };

  type Bench = {
    getVersion : () -> Nat;
    getSchema : () -> BenchSchema;
    runCell : (Nat, Nat) -> ();
  };

  type BenchResult = {
    instructions : Int;
    rts_mutator_instructions : Int;
    stable_memory_size : Int;
    rts_stable_memory_size : Int;
    rts_logical_stable_memory_size : Int;
    rts_collector_instructions : Int;
    rts_heap_size : Int;
    rts_memory_size : Int;
    rts_total_allocation : Int;
    rts_reclaimed : Int;
  };

  transient var benchOpt : ?Bench = null;

  public func init() : async BenchSchema {
    let bench = UserBench.init();
    benchOpt := ?bench;
    ignore Prim.regionGrow(Prim.regionNew(), 1);
    bench.getSchema();
  };

  public query func getSchema() : async BenchSchema {
    let ?bench = benchOpt else Runtime.trap("bench not initialized");
    bench.getSchema();
  };

  func _getStats() : BenchResult {
    {
      instructions = 0;
      rts_heap_size = Prim.rts_heap_size();
      stable_memory_size = Prim.rts_stable_memory_size() * 65536;
      rts_stable_memory_size = Prim.rts_stable_memory_size();
      rts_logical_stable_memory_size = Prim.rts_logical_stable_memory_size();
      rts_memory_size = Prim.rts_memory_size();
      rts_total_allocation = Prim.rts_total_allocation();
      rts_reclaimed = Prim.rts_reclaimed();
      rts_mutator_instructions = Prim.rts_mutator_instructions();
      rts_collector_instructions = Prim.rts_collector_instructions();
    };
  };

  func _diffStats(before : BenchResult, after : BenchResult) : BenchResult {
    {
      instructions = after.instructions - before.instructions;
      rts_heap_size = after.rts_heap_size - before.rts_heap_size;
      stable_memory_size = after.stable_memory_size - before.stable_memory_size;
      rts_stable_memory_size = after.rts_stable_memory_size - before.rts_stable_memory_size;
      rts_logical_stable_memory_size = after.rts_logical_stable_memory_size - before.rts_logical_stable_memory_size;
      rts_memory_size = after.rts_memory_size - before.rts_memory_size;
      rts_total_allocation = after.rts_total_allocation - before.rts_total_allocation;
      rts_reclaimed = after.rts_reclaimed - before.rts_reclaimed;
      rts_mutator_instructions = after.rts_mutator_instructions - before.rts_mutator_instructions;
      rts_collector_instructions = after.rts_collector_instructions - before.rts_collector_instructions;
    };
  };

  func _runCell(rowIndex : Nat, colIndex : Nat) : BenchResult {
    let ?bench = benchOpt else Runtime.trap("bench not initialized");
    // Look up the cell function outside the measured closure, so its
    // instruction count includes only the call.
    let runCell = bench.runCell;
    let cell = func() { runCell(rowIndex, colIndex) };
    let statsBefore = _getStats();
    // Read the heap counters immediately around the cell so the harness's own
    // allocations (the stats records, the closure) stay outside the window.
    // The incremental GC runs only between messages, so nothing is collected
    // inside this synchronous window: heap growth is the cell's allocation.
    // The heap counter is read innermost: under legacy persistence, reading a
    // large `rts_total_allocation` can allocate, and that must not count as heap.
    let (allocBefore, heapBefore) = (Prim.rts_total_allocation(), Prim.rts_heap_size());
    let instructions = Prim.nat64ToNat(InternetComputer.countInstructions(cell));
    let (heapAfter, allocAfter) = (Prim.rts_heap_size(), Prim.rts_total_allocation());
    let statsAfter = _getStats();
    {
      _diffStats(statsBefore, { statsAfter with instructions }) with
      rts_heap_size = heapAfter - heapBefore : Int;
      rts_total_allocation = allocAfter - allocBefore : Int;
    };
  };

  // Returns the collector's cumulative instruction count. The CLI calls this
  // between cells until two consecutive calls return the same count: then the
  // message in between ended without a GC increment, so no incremental GC
  // cycle is in progress. A cycle in progress turns on the GC's write and
  // allocation barriers, which add instructions to the cell itself.
  public func collectorInstructions() : async Nat {
    Prim.rts_collector_instructions();
  };

  public query func getStats() : async BenchResult {
    _getStats();
  };

  public query func runCellQuery(rowIndex : Nat, colIndex : Nat) : async BenchResult {
    _runCell(rowIndex, colIndex);
  };

  public func runCellUpdate(rowIndex : Nat, colIndex : Nat) : async BenchResult {
    _runCell(rowIndex, colIndex);
  };

  // Kept under this name for the CLI. The cell runs synchronously, so there is
  // nothing to await: a cell cannot start inter-canister calls.
  public func runCellUpdateAwait(rowIndex : Nat, colIndex : Nat) : async BenchResult {
    _runCell(rowIndex, colIndex);
  };
};
