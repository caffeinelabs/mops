// Trivial bench: the point is that the generated canister compiles under
// the fixture's `-E=M0223,M0236,M0237`.
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
      description = "Trivial bench compiled with lints as errors";
      rows = ["a"];
      cols = ["1"];
    };
    func run(_ri : Nat, _ci : Nat) {};
    Bench(schema, run);
  };
};
