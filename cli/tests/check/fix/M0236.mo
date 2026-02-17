// M0236: Suggested to use dot notation
// Function calls can be rewritten using dot notation
import Array "mo:core/Array";

persistent actor {
  public func testM0236() : async Nat {
    let arr = [1, 2, 3];
    let len = Array.size(arr);
    len;
  };
};
