// Regression fixture: --fix must apply byte-accurately on lines containing
// multi-byte UTF-8 characters. Each `Char.toNat32` triggers M0236; the fixer
// must preserve the trailing `)` after the multi-byte literal.
import Char "mo:core/Char";

module {
  public func go() {
    ignore Char.toNat32('A');
    ignore Char.toNat32('京');
    ignore Char.toNat32('💩');
  };
};
