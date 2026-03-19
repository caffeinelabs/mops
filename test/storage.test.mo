import Result "mo:base/Result";
import Blob "mo:base/Blob";
import { test; suite; skip } "mo:test/async";

import Storage "../backend/storage/storage-canister";

var storage = await Storage.Storage();
let fileId = "test";

// upload
await suite(
  "storage upload",
  func() : async () {
    await test(
      "try to finish upload before upload start",
      func() : async () {
        let res = await storage.finishUploads([fileId]);
        assert Result.isErr(res);
      },
    );

    await test(
      "try to upload chunk before upload start",
      func() : async () {
        assert Result.isErr(await storage.uploadChunk(fileId, 0, Blob.fromArray([])));
      },
    );

    await test(
      "start upload",
      func() : async () {
        assert Result.isOk(await storage.startUpload({ id = fileId; path = "test/test.mo"; chunkCount = 1; owners = [] }));
      },
    );

    await test(
      "try to finish upload with unknown file id",
      func() : async () {
        assert Result.isErr(await storage.finishUploads([fileId, "unknown-file-id"]));
      },
    );

    await test(
      "finish upload",
      func() : async () {
        assert Result.isOk(await storage.finishUploads([fileId]));
      },
    );

    await test(
      "try to finish already finished upload",
      func() : async () {
        assert Result.isErr(await storage.finishUploads([fileId]));
      },
    );

    await test(
      "try to start upload existing file",
      func() : async () {
        assert Result.isErr(await storage.startUpload({ id = fileId; path = "test/test.mo"; chunkCount = 1; owners = [] }));
      },
    );
  },
);

// download
await suite(
  "storage download",
  func() : async () {
    await test(
      "get file meta",
      func() : async () {
        let res = await storage.getFileMeta(fileId);
        assert Result.isOk(res);
        switch (res) {
          case (#ok(fileMeta)) {
            assert fileMeta.path == "test/test.mo";
            assert fileMeta.chunkCount == 1;
            assert fileMeta.owners == [];
          };
          case (_) {};
        };
      },
    );

    await test(
      "try to get file meta of unknown file",
      func() : async () {
        let res = await storage.getFileMeta("123");
        assert Result.isErr(res);
      },
    );

    await skip(
      "upgrade storage canister",
      func() : async () {
        // actor class configuration unsupported in interpreter
        storage := await (system Storage.Storage)(#upgrade storage)();
      },
    );
  },
);
