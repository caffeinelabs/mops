import Text "mo:base/Text";
import Char "mo:base/Char";
import Nat "mo:base/Nat";
import Nat32 "mo:base/Nat32";
import Order "mo:base/Order";
import Result "mo:base/Result";

import Types "../types";

module {
  public type Version = Text.Text;
  type Err = Types.Err;

  public func major(ver : Version) : Nat {
    textToNat(versionPart(ver, 0));
  };

  public func minor(ver : Version) : Nat {
    textToNat(versionPart(ver, 1));
  };

  public func patch(ver : Version) : Nat {
    textToNat(versionPart(ver, 2));
  };

  func textToNat(text : Text) : Nat {
    var res = 0;
    for (char in text.chars()) {
      let n = (Nat32.toNat(Char.toNat32(char)) - 48) : Nat;
      res := res * 10 + n;
    };
    res;
  };

  func versionPart(ver : Version, partIndex : Nat) : Text.Text {
    var res = "";
    var dots = 0;
    for (char in ver.chars()) {
      if (dots == partIndex) {
        if (Char.isDigit(char)) {
          res #= Text.fromChar(char);
        } else {
          return res;
        };
      } else if (char == '.') {
        dots += 1;
      };
    };
    res;
  };

  public func compare(x : Version, y : Version) : Order.Order {
    let order = Nat.compare(major(x), major(y));
    if (order == #equal) {
      let order = Nat.compare(minor(x), minor(y));
      if (order == #equal) {
        Nat.compare(patch(x), patch(y));
      } else {
        order;
      };
    } else {
      order;
    };
  };

  public func equal(x : Version, y : Version) : Bool {
    compare(x, y) == #equal;
  };

  // TODO: support 1.2.3-pre.1
  public func validate(ver : Version) : Result.Result<(), Err> {
    var dots = 0;
    var prevChar = '.';
    var index = 0;
    var digitSeq = 0;
    let wrongFormatErr = #err("invalid version: wrong version fromat '" # ver # "'. Expected version format is 'xx.xx.xx'");

    for (char in ver.chars()) {
      let unexpectedCharErr = #err("invalid version: unexpected char '" # Char.toText(char) # "' in '" # ver # "' at index " # Nat.toText(index));

      // deny .1.2.3
      // deny 1..2.3
      if (prevChar == '.' and not Char.isDigit(char)) {
        return unexpectedCharErr;
      };
      // deny 1.2.3.4
      if (char == '.' and dots >= 3) {
        return unexpectedCharErr;
      };
      // deny 1.2.3a
      // deny 1.2b.3
      if (Char.isDigit(prevChar) and not Char.isDigit(char) and char != '.') {
        return unexpectedCharErr;
      };

      if (Char.isDigit(char)) {
        digitSeq += 1;
      } else {
        digitSeq := 0;
      };

      // deny 123.1.2
      // deny 1.133.222
      if (digitSeq > 2) {
        return wrongFormatErr;
      };

      if (char == '.') {
        dots += 1;
      };
      index += 1;
      prevChar := char;
    };

    if (dots != 2) {
      return wrongFormatErr;
    };

    if (prevChar == '.') {
      return #err("invalid version: last char cannot be '.' in '" # ver # "'");
    };

    #ok;
  };
};
