// M0223: Redundant type instantiation
// The type annotation is not needed when it can be inferred
import List "mo:core/List";

persistent actor {
  public func testM0223() : async Bool {
    let list : List.List<Nat> = List.empty<Nat>();
    list.isEmpty();
  };
};
