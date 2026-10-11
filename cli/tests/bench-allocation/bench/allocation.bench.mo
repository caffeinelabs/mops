import Prim "mo:prim";

// Cells with a known allocation, to check that the Heap column reports
// exactly what the routine allocates and nothing of the measurement harness.
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
      name = "Allocation";
      description = "No-op and a fixed-size array allocation";
      rows = ["noop", "array"];
      cols = ["a", "b"];
    };
    func run(ri : Nat, _ci : Nat) {
      if (ri == 1) ignore Prim.Array_init<Nat>(1000, 0);
    };
    Bench(schema, run);
  };
};
