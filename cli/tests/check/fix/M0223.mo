// M0223: Redundant type instantiation
// The type annotation is not needed when it can be inferred

persistent actor {
  public func testM0223() : async () {
    func identity<T>(x : T) : T = x;
    let varArray : [var Nat] = [var 1];
    let nat = identity<Nat>(1);
    varArray[0] := nat;
  };
};
