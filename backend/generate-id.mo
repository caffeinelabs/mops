import Random "mo:base/Random";
import Blob "mo:base/Blob";
import Nat8 "mo:base/Nat8";

module {
  public func generateId() : async Text {
    let b = await Random.blob();
    let ar = Blob.toArray(b);
    Nat8.toText(ar[0]) # Nat8.toText(ar[1]) # Nat8.toText(ar[2]) # Nat8.toText(ar[3]) # Nat8.toText(ar[4]) # Nat8.toText(ar[5]) # Nat8.toText(ar[6]);
  };
};
