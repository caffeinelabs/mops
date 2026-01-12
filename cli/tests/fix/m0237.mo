type Order = {
  #less;
  #equal;
  #greater;
};

module Nat {
  public func compare(_ : Nat, _ : Nat) : Order { #equal };
};

module Map {
  public type Map<K, V> = { map : [(K, [var V])] };
  public func empty<K, V>() : Map<K, V> = { map = [] };

  public func get<K, V>(
    self : Map<K, V>,
    compare : (implicit : (K, K) -> Order),
    n : K,
  ) : ?V {
    ignore (self, compare, n);
    null;
  };
};

module M {
  public func main() {
    let peopleMap = Map.empty<Nat, Text>();
    ignore peopleMap.get(Nat.compare, 1); // Redundant explicit argument
    ignore peopleMap.get(
      Nat.compare,
      1,
    ); // Redundant explicit argument
  };
};
