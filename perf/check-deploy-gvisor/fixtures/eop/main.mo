// Representative current-generation Motoko backend: persistent actor,
// mo:core collections, some real init work so the deployment check
// executes actual rounds — the structure of a typical wasm64/EOP app.
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";

persistent actor {
  let users = Map.empty<Nat, Text>();
  let index = Map.empty<Text, Nat>();
  var revision = 0;

  // init: populate some state so installation is not a no-op
  var i = 0;
  while (i < 1000) {
    let name = "user-" # Nat.toText(i);
    Map.add(users, Nat.compare, i, name);
    Map.add(index, Text.compare, name, i);
    i += 1;
  };

  public func register(name : Text) : async Nat {
    let id = Map.size(users);
    Map.add(users, Nat.compare, id, name);
    Map.add(index, Text.compare, name, id);
    revision += 1;
    id;
  };

  public query func lookup(name : Text) : async ?Nat {
    Map.get(index, Text.compare, name);
  };
};
