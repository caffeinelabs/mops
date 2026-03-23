import Result "mo:base/Result";
import Blob "mo:base/Blob";
import { test; suite } "mo:test/async";

import Storage "../backend/storage/storage-canister";

var storage = await Storage.Storage();

// PRECONDITION: startUpload is idempotent — resets active upload (prevents stale data)
await suite(
  "FIX: startUpload resets active upload, finishUploads catches empty chunks",
  func() : async () {
    let fileId = "core@2.3.0/src/Runtime.mo";
    let realData = Blob.fromArray([1, 2, 3, 4, 5, 6, 7, 8]);

    await test(
      "start upload and fill chunk",
      func() : async () {
        assert Result.isOk(await storage.startUpload({ id = fileId; path = "src/Runtime.mo"; chunkCount = 1; owners = [] }));
        assert Result.isOk(await storage.uploadChunk(fileId, 0, realData));
      },
    );

    await test(
      "second startUpload resets the active upload (idempotent)",
      func() : async () {
        assert Result.isOk(await storage.startUpload({ id = fileId; path = "src/Runtime.mo"; chunkCount = 1; owners = [] }));
      },
    );

    await test(
      "finishUploads rejects because reset cleared the chunk data",
      func() : async () {
        assert Result.isErr(await storage.finishUploads([fileId]));
      },
    );
  },
);

// PRECONDITION: idempotent startUpload allows a clean retry to succeed
await suite(
  "FIX: retry after reset succeeds with fresh data",
  func() : async () {
    storage := await Storage.Storage();
    let fileId = "core@2.3.0/src/Runtime.mo";
    let staleData = Blob.fromArray([1, 2, 3]);
    let freshData = Blob.fromArray([10, 20, 30, 40, 50]);

    await test(
      "stale session: start and upload",
      func() : async () {
        assert Result.isOk(await storage.startUpload({ id = fileId; path = "src/Runtime.mo"; chunkCount = 1; owners = [] }));
        assert Result.isOk(await storage.uploadChunk(fileId, 0, staleData));
      },
    );

    await test(
      "retry session: startUpload resets, then upload fresh data",
      func() : async () {
        assert Result.isOk(await storage.startUpload({ id = fileId; path = "src/Runtime.mo"; chunkCount = 1; owners = [] }));
        assert Result.isOk(await storage.uploadChunk(fileId, 0, freshData));
      },
    );

    await test(
      "finishUploads succeeds with fresh data",
      func() : async () {
        assert Result.isOk(await storage.finishUploads([fileId]));
      },
    );

    await test(
      "downloaded file has the fresh data",
      func() : async () {
        let chunkRes = await storage.downloadChunk(fileId, 0);
        switch (chunkRes) {
          case (#ok(chunk)) {
            assert chunk == freshData;
          };
          case (#err(_)) {
            assert false;
          };
        };
      },
    );
  },
);

// FIX VERIFICATION: finishUploads rejects files with empty chunks
await suite(
  "FIX: finishUploads rejects empty chunks",
  func() : async () {
    storage := await Storage.Storage();
    let fileId = "pkg@1.0.0/src/Lib.mo";

    await test(
      "start upload with chunkCount=2 but upload only chunk 0",
      func() : async () {
        assert Result.isOk(await storage.startUpload({ id = fileId; path = "src/Lib.mo"; chunkCount = 2; owners = [] }));
        assert Result.isOk(await storage.uploadChunk(fileId, 0, Blob.fromArray([10, 20, 30])));
      },
    );

    await test(
      "finishUploads is rejected because chunk 1 was never uploaded",
      func() : async () {
        let res = await storage.finishUploads([fileId]);
        assert Result.isErr(res);
      },
    );
  },
);

// REGRESSION: normal upload flow still works
await suite(
  "REGRESSION: normal upload flow",
  func() : async () {
    storage := await Storage.Storage();
    let fileId = "pkg@2.0.0/src/Main.mo";
    let data1 = Blob.fromArray([10, 20, 30, 40, 50]);
    let data2 = Blob.fromArray([60, 70, 80]);

    await test(
      "upload file with 2 chunks",
      func() : async () {
        assert Result.isOk(await storage.startUpload({ id = fileId; path = "src/Main.mo"; chunkCount = 2; owners = [] }));
        assert Result.isOk(await storage.uploadChunk(fileId, 0, data1));
        assert Result.isOk(await storage.uploadChunk(fileId, 1, data2));
      },
    );

    await test(
      "finishUploads succeeds when all chunks are present",
      func() : async () {
        assert Result.isOk(await storage.finishUploads([fileId]));
      },
    );

    await test(
      "downloaded chunks have correct data",
      func() : async () {
        let c0 = await storage.downloadChunk(fileId, 0);
        switch (c0) {
          case (#ok(chunk)) { assert chunk == data1 };
          case (#err(_)) { assert false };
        };
        let c1 = await storage.downloadChunk(fileId, 1);
        switch (c1) {
          case (#ok(chunk)) { assert chunk == data2 };
          case (#err(_)) { assert false };
        };
      },
    );
  },
);

// REGRESSION: empty files (chunkCount=0) still work
await suite(
  "REGRESSION: empty files (chunkCount=0) are allowed",
  func() : async () {
    storage := await Storage.Storage();
    let fileId = "pkg@3.0.0/src/Empty.mo";

    await test(
      "start upload with chunkCount=0",
      func() : async () {
        assert Result.isOk(await storage.startUpload({ id = fileId; path = "src/Empty.mo"; chunkCount = 0; owners = [] }));
      },
    );

    await test(
      "finishUploads succeeds for empty files",
      func() : async () {
        assert Result.isOk(await storage.finishUploads([fileId]));
      },
    );

    await test(
      "file meta reports 0 chunks",
      func() : async () {
        let res = await storage.getFileMeta(fileId);
        switch (res) {
          case (#ok(meta)) { assert meta.chunkCount == 0 };
          case (#err(_)) { assert false };
        };
      },
    );
  },
);
