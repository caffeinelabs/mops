import Prim "mo:prim";

// Every cell does the same work, so every cell must cost the same number of
// instructions. The live heap built in `init` is large enough that an
// incremental GC cycle spans several messages; a cell that starts while a
// cycle is in progress pays for the GC's write barrier on every pointer write.
module {
  type Schema = {
    name : Text;
    description : Text;
    rows : [Text];
    cols : [Text];
  };

  class Bench(schema : Schema, run : (Nat, Nat) -> ()) {
    public func getVersion() : Nat = 1;
    public func getSchema() : Schema = schema;
    public let runCell = run;
  };

  // Generic, so the element writes go through the GC's write barrier.
  func fill<T>(a : [var T], v : T) {
    var i = 0;
    while (i < a.size()) {
      a[i] := v;
      i += 1;
    };
  };

  public func init() : Bench {
    let schema : Schema = {
      name = "Barrier";
      description = "Identical cells on a large live heap";
      rows = ["a", "b"];
      cols = ["1", "2", "3", "4"];
    };
    let live = Prim.Array_tabulate<[var Nat]>(1_000_000, func i = [var i]);
    let targets = Prim.Array_tabulate<[var ?Nat]>(8, func _ = Prim.Array_init<?Nat>(100_000, null));
    func run(ri : Nat, ci : Nat) {
      fill<?Nat>(targets[ri * 4 + ci], ?live.size());
    };
    Bench(schema, run);
  };
};
