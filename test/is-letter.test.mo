import { test } "mo:test";

import { isLetter; isLowerCaseLetter; isUpperCaseLetter } "../backend/main/utils/is-letter";

test(
  "isLetter",
  func() {
    assert isLetter('a');
    assert isLetter('b');
    assert isLetter('z');
    assert isLetter('y');
    assert not isLetter('2');
    assert not isLetter('0');
    assert not isLetter('1');
    assert not isLetter('-');
    assert not isLetter('&');
  },
);

test(
  "isLowerCaseLetter",
  func() {
    assert isLowerCaseLetter('a');
    assert isLowerCaseLetter('b');
    assert isLowerCaseLetter('z');
    assert isLowerCaseLetter('y');
    assert not isLowerCaseLetter('A');
    assert not isLowerCaseLetter('G');
    assert not isLowerCaseLetter('1');
    assert not isLowerCaseLetter('-');
    assert not isLowerCaseLetter('&');
  },
);

test(
  "isUpperCaseLetter",
  func() {
    assert isUpperCaseLetter('A');
    assert isUpperCaseLetter('B');
    assert isUpperCaseLetter('Z');
    assert isUpperCaseLetter('Y');
    assert not isUpperCaseLetter('g');
    assert not isUpperCaseLetter('d');
    assert not isUpperCaseLetter('1');
    assert not isUpperCaseLetter('-');
    assert not isUpperCaseLetter('&');
  },
);
