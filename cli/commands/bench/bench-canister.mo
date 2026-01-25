import Nat64 "mo:core/Nat64";
import Nat "mo:core/Nat";
import Runtime "mo:core/Runtime";
import InternetComputer "mo:core/InternetComputer";
import Int64 "mo:core/Int64";
import Region "mo:core/Region";
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
    ignore Region.grow(Region.new(), 1);
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
      stable_memory_size = Int64.toInt(Int64.fromNat64(Prim.stableMemorySize())) * 65536;
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
    let statsBefore = _getStats();

    let instructions = Nat64.toNat(
      InternetComputer.countInstructions(
        func() {
          bench.runCell(rowIndex, colIndex);
        }
      )
    );

    let statsAfter = _getStats();
    _diffStats(statsBefore, { statsAfter with instructions });
  };

  func _runCellAwait(rowIndex : Nat, colIndex : Nat) : async BenchResult {
    let ?bench = benchOpt else Runtime.trap("bench not initialized");
    let statsBefore = _getStats();

    let instructions = Nat64.toNat(
      InternetComputer.countInstructions(
        func() {
          bench.runCell(rowIndex, colIndex);
        }
      )
    );

    await (func() : async () {})();

    let statsAfter = _getStats();
    _diffStats(statsBefore, { statsAfter with instructions });
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

  public func runCellUpdateAwait(rowIndex : Nat, colIndex : Nat) : async BenchResult {
    await _runCellAwait(rowIndex, colIndex);
  };
};
