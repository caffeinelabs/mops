import Lib "./transitive-lib";

persistent actor {
  public func run() : async () {
    Lib.test();
  };
};
