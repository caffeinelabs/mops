import Lib "./transitive-lib";

actor {
  public func run() : async () {
    func identity<T>(x : T) : T = x;
    let _ = identity<Nat>(1);
    Lib.test();
  };
};
