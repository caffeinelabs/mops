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
      name = "Simple";
      description = "";
      rows = ["a"];
      cols = ["1"];
    };
    func run(_ri : Nat, _ci : Nat) {};
    Bench(schema, run);
  };
};
