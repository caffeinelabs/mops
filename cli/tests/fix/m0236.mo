module Map {
  public type Map<K, V> = { map : [(K, [var V])] };
  public func empty<K, V>() : Map<K, V> = { map = [] };
  public func size<K, V>(self : Map<K, V>) : Nat { self.map.size() };
};

module M {
  public func main() {
    let peopleMap = Map.empty<Nat, Text>();
    ignore Map.size(peopleMap);
  };
};
