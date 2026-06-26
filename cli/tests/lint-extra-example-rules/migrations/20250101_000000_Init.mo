import Map "mo:map/Map";
import Backend "canister:backend";
import Types "../src/Types";

module {
  public func migration(_ : {}) : { count : Nat } {
    { count = 0 };
  };
};
