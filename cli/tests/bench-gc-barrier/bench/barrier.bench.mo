import Prim "mo:prim";

// The "fill" cells do identical work, so they must cost the same instructions.
// A "garbage" cell can start a GC cycle that spans several messages, and a cell started mid-cycle pays for the write barrier.
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

  // Every write goes through the GC's write barrier, as `?Nat` may hold a pointer.
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
      description = "Identical writes between cells that leave garbage";
      rows = ["a", "b", "c", "d"];
      cols = ["fill", "garbage"];
    };
    let live = Prim.Array_tabulate<[var Nat]>(1_000_000, func i = [var i]);
    let target = Prim.Array_init<?Nat>(100_000, null);
    func run(_ : Nat, ci : Nat) {
      if (ci == 0) {
        fill<?Nat>(target, ?live.size());
      } else {
        var i = 0;
        while (i < 5) {
          ignore Prim.Array_init<Nat>(1_000_000, i);
          i += 1;
        };
      };
    };
    Bench(schema, run);
  };
};
