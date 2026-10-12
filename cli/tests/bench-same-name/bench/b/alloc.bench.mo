import Prim "mo:prim";

// Shares its name with bench/a/alloc.bench.mo but allocates a different amount,
// so the Heap it reports shows whether it ran in its own canister.
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

  public func init() : Bench {
    let schema : Schema = {
      name = "Alloc B";
      description = "Allocates a 2000-element array";
      rows = ["array"];
      cols = ["b"];
    };
    func run(_ri : Nat, _ci : Nat) {
      ignore Prim.Array_init<Nat>(2000, 0);
    };
    Bench(schema, run);
  };
};
