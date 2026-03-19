module {
  public type Err = Text;
  public type FileId = Text;

  public type StorageStats = {
    fileCount : Nat;
    memorySize : Nat;
    cyclesBalance : Nat;
  };

  public type FileMeta = {
    id : FileId;
    path : Text;
    chunkCount : Nat;
    owners : [Principal]; // empty - public
  };

  public type Chunk = Blob;
};
