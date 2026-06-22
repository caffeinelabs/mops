// Regression fixture: --fix must apply byte-accurately on lines containing
// multi-byte UTF-8 characters. `Char.toNat32(c)` triggers M0236 (dot notation);
// the multi-byte text before each span used to throw off the column-based edit,
// dropping the trailing `)`. Literal receivers are avoided on purpose — moc no
// longer suggests dot-rewrites for them (caffeinelabs/motoko#6173).
import Char "mo:core/Char";

module {
  public func go(c : Char) {
    ignore Char.toNat32(c);
    ignore "京";
    ignore Char.toNat32(c);
    ignore "💩";
    ignore Char.toNat32(c);
  };
};
