import { test; suite } "mo:test";
import Fuzz "mo:fuzz";
import { DAY } "mo:time-consts";
import Time "mo:base/Time";

import DownloadLog "../backend/main/DownloadLog";

let fuzz = Fuzz.Fuzz();

suite(
  "download trend",
  func() {
    let downloadLog = DownloadLog.DownloadLog();
    let now = 1695284555986000000;

    test(
      "add 100 days old record for 'pkg1'",
      func() {
        downloadLog.add({
          time = now - 100 * DAY + 100;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "add 100 days old record for 'pkg1'",
      func() {
        downloadLog.add({
          time = now - 100 * DAY;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "take snapshots",
      func() {
        downloadLog.takeSnapshotsIfNeeded(now - 100 * DAY);
      },
    );

    test(
      "add more than 10 days old record for 'pkg1",
      func() {
        downloadLog.add({
          time = now - 10 * DAY;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "take snapshots",
      func() {
        downloadLog.takeSnapshotsIfNeeded(now - 10 * DAY);
      },
    );

    test(
      "add 6 days old record for 'pkg1'",
      func() {
        downloadLog.add({
          time = now - 6 * DAY;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "take snapshots",
      func() {
        downloadLog.takeSnapshotsIfNeeded(now - 6 * DAY);
      },
    );

    test(
      "add 4 days old records for 'pkg1' version 2.0.0",
      func() {
        downloadLog.add({
          time = now - 4 * DAY;
          name = "pkg1";
          version = "2.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "take snapshots",
      func() {
        downloadLog.takeSnapshotsIfNeeded(now - 4 * DAY);
      },
    );

    test(
      "check download snapshots of all packages",
      func() {
        let snapshots = downloadLog.getDownloadTrend();
        assert snapshots.size() == 4;
        assert snapshots[0].downloads == 2;
        assert snapshots[1].downloads == 1;
        assert snapshots[2].downloads == 1;
        assert snapshots[3].downloads == 1;
      },
    );
  },
);

suite(
  "download trend with 0 downloads",
  func() {
    let downloadLog = DownloadLog.DownloadLog();

    test(
      "add 100 days old record for 'pkg1'",
      func() {
        downloadLog.add({
          time = Time.now() - 100 * DAY + 100;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "take snapshots -100 days",
      func() {
        downloadLog.takeSnapshotsIfNeeded(Time.now() - 100 * DAY);
      },
    );

    test(
      "take snapshots -50 days",
      func() {
        downloadLog.takeSnapshotsIfNeeded(Time.now() - 50 * DAY);
      },
    );

    test(
      "add 40 days old record for 'pkg1'",
      func() {
        downloadLog.add({
          time = Time.now() - 40 * DAY + 100;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "add 40 days old record for 'pkg1'",
      func() {
        downloadLog.add({
          time = Time.now() - 40 * DAY + 100;
          name = "pkg1";
          version = "1.0.0";
          downloader = fuzz.principal.randomPrincipal(1);
        });
      },
    );

    test(
      "take snapshots -40 days",
      func() {
        downloadLog.takeSnapshotsIfNeeded(Time.now() - 40 * DAY);
      },
    );

    test(
      "check download trend for pkg1",
      func() {
        let snapshots = downloadLog.getDailyDownloadTrendByPackageName("pkg1");
        assert snapshots.size() == 3;
        assert snapshots[0].downloads == 1;
        assert snapshots[1].downloads == 0;
        assert snapshots[2].downloads == 2;
      },
    );
  },
);
