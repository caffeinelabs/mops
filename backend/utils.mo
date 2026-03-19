import Principal "mo:base/Principal";
import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import Nat "mo:base/Nat";
import Iter "mo:base/Iter";

module {
  let admins = ["uajwy-bzusi-36jtj-ajvmc-nep3q-b7zmb-wbdua-smdjo-j77n2-p7ciw-tae"];

  public func isAdmin(principal : Principal) : Bool {
    let principalText = Principal.toText(principal);
    let admin = Array.find<Text>(admins, func(id : Text) = id == principalText) != null;
    admin or Principal.isController(principal);
  };

  func _getPageItems<T>(items : [T], pageIndex : Nat, limit : Nat) : [T] {
    let start = pageIndex * limit;
    let end = Nat.min(start + limit, items.size());
    let size : Nat = end - start;

    if (size == 0) {
      return [];
    };

    let buf = Buffer.Buffer<T>(size);
    for (i in Iter.range(start, end - 1)) {
      buf.add(items[i]);
    };

    Buffer.toArray(buf);
  };

  public func getPage<T>(items : [T], pageIndex : Nat, limit : Nat) : ([T], Nat) {
    (
      _getPageItems(items, pageIndex, limit),
      items.size() / limit + (if (items.size() % limit == 0) 0 else 1),
    );
  };
};
