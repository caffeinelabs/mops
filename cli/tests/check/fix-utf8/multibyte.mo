// Regression fixture: --fix must apply byte-accurately when a multi-byte UTF-8
// literal sits before the dot-notation span on the SAME line — that's where
// moc's byte columns and LSP's UTF-16 positions diverge. Each body is a single
// expression so prettier keeps it on one line (it splits `;`-separated
// statements). `Char.toNat32(c)` triggers M0236; a column-based edit over-deletes
// past the multi-byte prefix and drops the trailing `)`. Literal receivers are
// avoided on purpose — moc no longer suggests dot-rewrites for them
// (caffeinelabs/motoko#6173).
import Char "mo:core/Char";

module {
  public func a(c : Char) : Text = "A" # debug_show (Char.toNat32(c));
  public func b(c : Char) : Text = "京" # debug_show (Char.toNat32(c));
  public func d(c : Char) : Text = "💩" # debug_show (Char.toNat32(c));
};
