import Array "mo:core/Array";

// Overlapping fixable errors (nested calls produce overlapping M0223 + M0236 edits)
do {
  let ar = [1, 2, 3];
  let _ = Array.filter<Nat>(
    Array.filter<Nat>(ar, func(x) { x > 0 }),
    func(x) { x > 0 },
  );
};
