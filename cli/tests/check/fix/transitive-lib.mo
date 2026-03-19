import List "mo:core/List";
import Nat "mo:core/Nat";

module {
  public func test() {
    let list = List.fromArray<Nat>([3, 2, 1]);
    List.sortInPlace(list);
  };
};
