// M0236: Suggested to use dot notation
// Function calls can be rewritten using dot notation
import List "mo:core/List";
import Nat "mo:core/Nat";

persistent actor {
  public func testM0236() : async () {
    let list = List.fromArray<Nat>([1, 2, 3]);
    List.sortInPlace(list);
  };
};
