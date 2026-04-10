import { test; suite } "mo:test";
import Fuzz "mo:fuzz";
import { MINUTE; DAY } "mo:time-consts";
import Time "mo:base/Time";

import DownloadLog "../backend/main/DownloadLog";

let fuzz = Fuzz.Fuzz();
let downloadLog = DownloadLog.DownloadLog();

suite(
  "populate",
  func() {
    test(
      "add 100 days old record for 'pkg1'",
      func() {
        downloadLog.add({
          time = Time.now() - 100 * DAY;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "add more than 10 days old record for 'pkg1",
      func() {
        downloadLog.add({
          time = Time.now() - 10 * DAY;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "add 6 days old record for 'pkg1'",
      func() {
        downloadLog.add({
          time = Time.now() - 6 * DAY;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "add 4 days old records for 'pkg1' version 2.0.0",
      func() {
        downloadLog.add({
          time = Time.now() - 4 * DAY;
          name = "pkg1";
          version = "2.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "add 1 day old record for 'pkg2'",
      func() {
        downloadLog.add({
          time = Time.now() - 1 * DAY;
          name = "pkg2";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "add 40 minutes old record for 'pkg2'",
      func() {
        downloadLog.add({
          time = Time.now() - 40 * MINUTE;
          name = "pkg2";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "add 40 minutes old record for 'pkg2'",
      func() {
        downloadLog.add({
          time = Time.now() - 40 * MINUTE;
          name = "pkg2";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "add 40 minutes old record for 'pkg2'",
      func() {
        downloadLog.add({
          time = Time.now() - 40 * MINUTE;
          name = "pkg2";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "add 35 minutes old record for 'pkg1'",
      func() {
        downloadLog.add({
          time = Time.now() - 35 * MINUTE;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "take snapshots",
      func() {
        // first snapshot is always taken
        downloadLog.takeSnapshotsIfNeeded(Time.now());
      },
    );

    test(
      "add 30 minutes old record for 'pkg1'",
      func() {
        downloadLog.add({
          time = Time.now() - 30 * MINUTE;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );
  },
);

func check(name : Text) = suite(
  name,
  func() {
    test(
      "check total downloads",
      func() {
        assert downloadLog.getTotalDownloads() == 10;
      },
    );

    test(
      "check download snapshots of all packages",
      func() {
        let snapshots = downloadLog.getDownloadTrend();
        assert snapshots.size() == 1;
        assert snapshots[0].downloads == 5;
      },
    );

    test(
      "check daily snapshots by package name for pkg1",
      func() {
        let snapshots = downloadLog.getDailyDownloadTrendByPackageName("pkg1");
        assert snapshots.size() == 1;
        assert snapshots[0].downloads == 1;
      },
    );

    test(
      "check daily snapshots by package name for pkg2",
      func() {
        let snapshots = downloadLog.getDailyDownloadTrendByPackageName("pkg2");
        assert snapshots.size() == 1;
        assert snapshots[0].downloads == 4;
      },
    );

    test(
      "check daily snapshots by package name for pkg2 with 0 downloads",
      func() {
        let snapshots = downloadLog.getDailyDownloadTrendByPackageId("lib@2.0.0");
        assert snapshots.size() == 0;
      },
    );

    test(
      "check daily snapshots by name for unknown package",
      func() {
        let snapshots = downloadLog.getDailyDownloadTrendByPackageName("lib");
        assert snapshots.size() == 0;
      },
    );

    test(
      "check daily snapshots by id for unknown package",
      func() {
        let snapshots = downloadLog.getDailyDownloadTrendByPackageId("lib@2.0.0");
        assert snapshots.size() == 0;
      },
    );

    test(
      "check total package downloads",
      func() {
        assert downloadLog.getTotalDownloadsByPackageName("pkg1") == 6;
        assert downloadLog.getTotalDownloadsByPackageId("pkg1@1.0.0") == 5;
        assert downloadLog.getTotalDownloadsByPackageId("pkg1@2.0.0") == 1;

        assert downloadLog.getTotalDownloadsByPackageName("pkg2") == 4;
        assert downloadLog.getTotalDownloadsByPackageId("pkg2@1.0.0") == 4;
        assert downloadLog.getTotalDownloadsByPackageId("pkg2@2.0.0") == 0;

        assert downloadLog.getTotalDownloadsByPackageName("lib") == 0;
        assert downloadLog.getTotalDownloadsByPackageId("lib@2.0.0") == 0;
      },
    );

    test(
      "getDownloadsByPackageNameIn",
      func() {
        assert downloadLog.getDownloadsByPackageNameIn("pkg1", 1 * DAY + 100, Time.now(), true) == 2;
        assert downloadLog.getDownloadsByPackageNameIn("pkg1", 2 * DAY, Time.now(), true) == 2;

        assert downloadLog.getDownloadsByPackageNameIn("pkg2", 1 * DAY + 100, Time.now(), true) == 4;
        assert downloadLog.getDownloadsByPackageNameIn("pkg2", 2 * DAY, Time.now(), true) == 4;

        assert downloadLog.getDownloadsByPackageNameIn("lib", 1 * DAY, Time.now(), true) == 0;
        assert downloadLog.getDownloadsByPackageNameIn("lib", 365 * DAY, Time.now(), true) == 0;
      },
    );

    test(
      "getMostDownloadedPackageNames",
      func() {
        assert downloadLog.getMostDownloadedPackageNames(5) == ["pkg1", "pkg2"];
      },
    );

    test(
      "getMostDownloadedPackageNamesIn",
      func() {
        assert downloadLog.getMostDownloadedPackageNamesIn(1 * DAY, Time.now(), 5) == ["pkg1", "pkg2"];
        assert downloadLog.getMostDownloadedPackageNamesIn(2 * DAY, Time.now(), 5) == ["pkg2", "pkg1"];

        assert downloadLog.getMostDownloadedPackageNamesIn(1 * DAY, Time.now(), 1) == ["pkg1"];
        assert downloadLog.getMostDownloadedPackageNamesIn(2 * DAY, Time.now(), 1) == ["pkg2"];
      },
    );
  },
);

check("check before upgrade");

test(
  "upgrade",
  func() {
    downloadLog.loadStable(downloadLog.toStable());
  },
);

check("check after upgrade");
