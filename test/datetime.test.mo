import DateComponents "mo:datetime/Components";
import Debug "mo:base/Debug";
import Iter "mo:base/Iter";
import { test } "mo:test";

test(
  "dayOfWeek",
  func() {
    for (i in Iter.range(1, 30)) {
      let components = {
        year = 2_023;
        month = 11;
        day = i;
        hour = 0;
        minute = 0;
        nanosecond = 0;
      };
      Debug.print(debug_show (i) # " - " # debug_show (DateComponents.dayOfWeek(components)));
    };
  },
);
