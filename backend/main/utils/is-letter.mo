module {
  public func isLowerCaseLetter(char : Char) : Bool {
    let letters = "abcdefghijklmnopqrstuvwxyz";
    for (letter in letters.chars()) {
      if (char == letter) {
        return true;
      };
    };
    return false;
  };

  public func isUpperCaseLetter(char : Char) : Bool {
    let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (letter in letters.chars()) {
      if (char == letter) {
        return true;
      };
    };
    return false;
  };

  public func isLetter(char : Char) : Bool {
    isLowerCaseLetter(char) or isUpperCaseLetter(char);
  };
};
