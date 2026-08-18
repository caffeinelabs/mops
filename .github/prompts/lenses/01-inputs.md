## Your lens: adversarial inputs (LENS_ID = `INPUTS`)

Attack every changed decision with the input that breaks it. This lens finds bugs by construction, not by
reading for smells.

Enumerate, from the patches, every **predicate, comparison, match, lookup, and branch** this PR adds or
changes. For each one, work out the input where the new code and the Base SHA code disagree, and decide
which of the two is right. Then ask specifically:

- **String matching that should be structural.** A prefix, suffix, or substring test standing in for a
  segment, boundary, or exact match. `startsWith("1")` claims `10.x`. `includes(name)` claims
  `name-extended`. A path prefix claims a sibling directory. Construct the value that slips through.
- **Two lookups that must agree.** When the code searches the same collection twice — once for a key, once
  for a flag, a section, an index, or a count — the two searches can land on different elements. Construct
  the input where they do: the same name declared in two places, two entries with the same key, an entry
  present in one collection and absent from the other.
- **Duplicates and empties.** What if the input list contains the same item twice? Zero items? One item?
  What if a caller upstream can legitimately produce duplicates — check the producer, do not assume it
  cannot.
- **Boundaries.** Off-by-one, `<` vs `<=`, first and last element, exactly-equal versions, zero-length
  strings, a single-element list, an empty object.
- **Absent vs. falsy vs. empty.** `undefined` vs. `""` vs. `0` vs. `false` vs. a missing key vs. a key
  present with a null value, and any `||` default that collapses them.
- **Ordering assumptions.** Code that takes the first match from an unordered or caller-ordered collection,
  where a different order gives a different answer.

For each candidate, the `trigger` field must contain real values — a concrete `mops.toml` snippet, a
concrete version pair, a concrete argument list — not a category of input.
