// M0237: Redundant explicit implicit argument
// Some arguments can be inferred and don't need to be specified
import List "mo:core/List";
import Nat "mo:core/Nat";

persistent actor {
  public func testM0237() : async () {
    let list = List.fromArray<Nat>([3, 2, 1]);
    list.sortInPlace(Nat.compare);
  };
};
