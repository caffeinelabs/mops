// Minimal benchmark exercising the `mops bench` pipeline under enhanced
// orthogonal persistence. The bench canister template only requires a module
// exposing init() -> { getVersion; getSchema; runCell }, so no `mo:bench`
// dependency is needed.

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
      name = "Sanity";
      description = "Trivial bench to exercise the mops bench pipeline under EOP";
      rows = ["a"];
      cols = ["1"];
    };
    func run(_ri : Nat, _ci : Nat) {};
    Bench(schema, run);
  };
};
