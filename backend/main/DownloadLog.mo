import Nat "mo:base/Nat";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Option "mo:base/Option";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import TrieMap "mo:base/TrieMap";
import Order "mo:base/Order";
import Timer "mo:base/Timer";
import Int "mo:base/Int";
import Debug "mo:base/Debug";

import { MINUTE; DAY } "mo:time-consts";
import DateComponents "mo:datetime/Components";

import Types "./types";
import PackageUtils "./utils/package-utils";

module {
  public type DownloadsSnapshot = Types.DownloadsSnapshot;
  public type PackageName = Types.PackageName;
  public type PackageId = Types.PackageId;
  public type PackageVersion = Types.PackageVersion;

  public type Record = {
    time : Time.Time;
    name : PackageName;
    version : PackageVersion;
    downloader : Principal;
  };

  public type ByPackageNameStable = [(Text.Text, Nat)];
  public type ByPackageIdStable = [(Text.Text, Nat)];
  public type Stable = ?{
    #v3 : {
      totalDownloads : Nat;
      downloadsByPackageName : [(Text.Text, Nat)];
      downloadsByPackageId : [(Text.Text, Nat)];
      dailySnapshots : [DownloadsSnapshot];
      weeklySnapshots : [DownloadsSnapshot];
      dailySnapshotsByPackageName : [(Text.Text, [DownloadsSnapshot])];
      dailySnapshotsByPackageId : [(Text.Text, [DownloadsSnapshot])];
      weeklySnapshotsByPackageName : [(Text.Text, [DownloadsSnapshot])];
      weeklySnapshotsByPackageId : [(Text.Text, [DownloadsSnapshot])];
      dailyTempRecords : [Record];
      weeklyTempRecords : [Record];
      curSnapshotDay : Nat;
      curSnapshotWeekDay : DateComponents.DayOfWeek;
      timerId : Nat;
    };
  };

  public class DownloadLog() = {
    var totalDownloads = 0;

    var downloadsByPackageName = TrieMap.TrieMap<PackageName, Nat>(Text.equal, Text.hash);
    var downloadsByPackageId = TrieMap.TrieMap<PackageId, Nat>(Text.equal, Text.hash);

    var dailySnapshots = Buffer.Buffer<DownloadsSnapshot>(1000);
    var weeklySnapshots = Buffer.Buffer<DownloadsSnapshot>(1000);

    var dailySnapshotsByPackageName = TrieMap.TrieMap<PackageName, Buffer.Buffer<DownloadsSnapshot>>(Text.equal, Text.hash);
    var dailySnapshotsByPackageId = TrieMap.TrieMap<PackageId, Buffer.Buffer<DownloadsSnapshot>>(Text.equal, Text.hash);
    var weeklySnapshotsByPackageName = TrieMap.TrieMap<PackageName, Buffer.Buffer<DownloadsSnapshot>>(Text.equal, Text.hash);
    var weeklySnapshotsByPackageId = TrieMap.TrieMap<PackageId, Buffer.Buffer<DownloadsSnapshot>>(Text.equal, Text.hash);

    var dailyTempRecords = Buffer.Buffer<Record>(1000); // records not yet added to daily snapshots
    var weeklyTempRecords = Buffer.Buffer<Record>(1000); // records not yet added to weekly snapshots
    var curSnapshotDay = 0;
    var curSnapshotWeekDay : DateComponents.DayOfWeek = #monday;
    var timerId = 0;

    public func add(record : Record) {
      let packageId = PackageUtils.getPackageId(record.name, record.version);
      dailyTempRecords.add(record);
      weeklyTempRecords.add(record);
      downloadsByPackageName.put(record.name, Option.get(downloadsByPackageName.get(record.name), 0) + 1);
      downloadsByPackageId.put(packageId, Option.get(downloadsByPackageId.get(packageId), 0) + 1);
      totalDownloads += 1;
    };

    public func getTotalDownloads() : Nat {
      totalDownloads;
    };

    public func recalcTotalDownloads() {
      var total = 0;
      for (count in downloadsByPackageName.vals()) {
        total += count;
      };
      totalDownloads := total;
    };

    public func getTotalDownloadsByPackageName(name : PackageName) : Nat {
      Option.get(downloadsByPackageName.get(name), 0);
    };

    public func getTotalDownloadsByPackageId(id : PackageId) : Nat {
      Option.get(downloadsByPackageId.get(id), 0);
    };

    func _getTrend(snapshotsOpt : ?Buffer.Buffer<DownloadsSnapshot>, max : Nat) : [DownloadsSnapshot] {
      switch (snapshotsOpt) {
        case (?snapshots) {
          Array.take(Buffer.toArray(snapshots), -max);
        };
        case (null) {
          [];
        };
      };
    };

    public func getDownloadTrend() : [DownloadsSnapshot] {
      _getTrend(?dailySnapshots, 14);
    };

    public func getDownloadTrendByPackageName(name : PackageName) : [DownloadsSnapshot] {
      _getTrend(weeklySnapshotsByPackageName.get(name), 48);
    };

    public func getDownloadTrendByPackageId(packageId : PackageId) : [DownloadsSnapshot] {
      _getTrend(weeklySnapshotsByPackageId.get(packageId), 48);
    };

    public func getDailyDownloadTrendByPackageName(name : PackageName) : [DownloadsSnapshot] {
      _getTrend(dailySnapshotsByPackageName.get(name), 14);
    };

    public func getDailyDownloadTrendByPackageId(packageId : PackageId) : [DownloadsSnapshot] {
      _getTrend(dailySnapshotsByPackageId.get(packageId), 14);
    };

    public func takeSnapshotsIfNeeded(now : Time.Time) {
      let startOfDay = now / 86_400_000_000_000 * 86_400_000_000_000;
      let dateComponents = DateComponents.fromTime(startOfDay);
      let weekDay = DateComponents.dayOfWeek(dateComponents);
      let day = dateComponents.day;

      // daily snapshots
      if (curSnapshotDay != Int.abs(day)) {
        let startOfPrevDay = startOfDay - 1 * DAY;
        let endOfPrevDay = startOfDay - 1;

        var dailyDownloads = 0;

        // daily by name
        let byPackageName = TrieMap.TrieMap<PackageName, Nat>(Text.equal, Text.hash);
        for (record in dailyTempRecords.vals()) {
          if (record.time >= startOfPrevDay) {
            dailyDownloads += 1;
            byPackageName.put(record.name, Option.get(byPackageName.get(record.name), 0) + 1);
          };
        };

        // existing package names
        for ((packageName, snapshots) in dailySnapshotsByPackageName.entries()) {
          let downloads = switch (byPackageName.get(packageName)) {
            case (?downloads) downloads;
            case (null) 0;
          };
          byPackageName.delete(packageName); // remove to leave only new package names
          snapshots.add({
            startTime = startOfPrevDay;
            endTime = endOfPrevDay;
            downloads = downloads;
          });
        };

        // new package names
        for ((name, downloads) in byPackageName.entries()) {
          let snapshots = switch (dailySnapshotsByPackageName.get(name)) {
            case (?snapshots) snapshots;
            case (null) {
              let snapshots = Buffer.Buffer<DownloadsSnapshot>(1);
              dailySnapshotsByPackageName.put(name, snapshots);
              snapshots;
            };
          };
          snapshots.add({
            startTime = startOfPrevDay;
            endTime = endOfPrevDay;
            downloads = downloads;
          });
        };

        // daily by id
        let byPackageId = TrieMap.TrieMap<PackageName, Nat>(Text.equal, Text.hash);
        for (record in dailyTempRecords.vals()) {
          if (record.time >= startOfPrevDay) {
            let packageId = PackageUtils.getPackageId(record.name, record.version);
            byPackageId.put(packageId, Option.get(byPackageId.get(packageId), 0) + 1);
          };
        };

        // existing package ids
        for ((packageId, snapshots) in dailySnapshotsByPackageId.entries()) {
          let downloads = switch (byPackageId.get(packageId)) {
            case (?downloads) downloads;
            case (null) 0;
          };
          byPackageId.delete(packageId); // remove to leave only new package ids
          snapshots.add({
            startTime = startOfPrevDay;
            endTime = endOfPrevDay;
            downloads = downloads;
          });
        };

        // new package ids
        for ((packageId, downloads) in byPackageId.entries()) {
          let snapshots = switch (dailySnapshotsByPackageId.get(packageId)) {
            case (?snapshots) snapshots;
            case (null) {
              let snapshots = Buffer.Buffer<DownloadsSnapshot>(1);
              dailySnapshotsByPackageId.put(packageId, snapshots);
              snapshots;
            };
          };
          snapshots.add({
            startTime = startOfPrevDay;
            endTime = endOfPrevDay;
            downloads = downloads;
          });
        };

        // daily of all packages
        dailySnapshots.add({
          startTime = startOfPrevDay;
          endTime = endOfPrevDay;
          downloads = dailyDownloads;
        });

        dailyTempRecords.clear();
      };

      // weekly snapshots
      if (curSnapshotWeekDay != weekDay and weekDay == #monday) {
        let startOfPrevWeek = startOfDay - 7 * DAY;
        let endOfPrevWeek = startOfDay - 1;

        var weeklyDownloads = 0;

        // weekly by name
        let byPackageName = TrieMap.TrieMap<PackageName, Nat>(Text.equal, Text.hash);
        for (record in weeklyTempRecords.vals()) {
          if (record.time >= startOfPrevWeek) {
            weeklyDownloads += 1;
            byPackageName.put(record.name, Option.get(byPackageName.get(record.name), 0) + 1);
          };
        };

        // existing package names
        for ((packageName, snapshots) in weeklySnapshotsByPackageName.entries()) {
          let downloads = switch (byPackageName.get(packageName)) {
            case (?downloads) downloads;
            case (null) 0;
          };
          byPackageName.delete(packageName); // remove to leave only new package names
          snapshots.add({
            startTime = startOfPrevWeek;
            endTime = endOfPrevWeek;
            downloads = downloads;
          });
        };

        // new package names
        for ((name, downloads) in byPackageName.entries()) {
          let snapshots = switch (weeklySnapshotsByPackageName.get(name)) {
            case (?snapshots) snapshots;
            case (null) {
              let snapshots = Buffer.Buffer<DownloadsSnapshot>(1);
              weeklySnapshotsByPackageName.put(name, snapshots);
              snapshots;
            };
          };
          snapshots.add({
            startTime = startOfPrevWeek;
            endTime = endOfPrevWeek;
            downloads = downloads;
          });
        };

        // weekly by id
        let byPackageId = TrieMap.TrieMap<PackageName, Nat>(Text.equal, Text.hash);
        for (record in weeklyTempRecords.vals()) {
          if (record.time >= startOfPrevWeek) {
            let packageId = PackageUtils.getPackageId(record.name, record.version);
            byPackageId.put(packageId, Option.get(byPackageId.get(packageId), 0) + 1);
          };
        };

        // existing package ids
        for ((packageId, snapshots) in weeklySnapshotsByPackageId.entries()) {
          let downloads = switch (byPackageId.get(packageId)) {
            case (?downloads) downloads;
            case (null) 0;
          };
          byPackageId.delete(packageId); // remove to leave only new package ids
          snapshots.add({
            startTime = startOfPrevWeek;
            endTime = endOfPrevWeek;
            downloads = downloads;
          });
        };

        // new package ids
        for ((packageId, downloads) in byPackageId.entries()) {
          let snapshots = switch (weeklySnapshotsByPackageId.get(packageId)) {
            case (?snapshots) snapshots;
            case (null) {
              let snapshots = Buffer.Buffer<DownloadsSnapshot>(1);
              weeklySnapshotsByPackageId.put(packageId, snapshots);
              snapshots;
            };
          };
          snapshots.add({
            startTime = startOfPrevWeek;
            endTime = endOfPrevWeek;
            downloads = downloads;
          });
        };

        // weekly of all packages
        weeklySnapshots.add({
          startTime = startOfPrevWeek;
          endTime = endOfPrevWeek;
          downloads = totalDownloads;
        });

        weeklyTempRecords.clear();
      };

      curSnapshotDay := Int.abs(day);
      curSnapshotWeekDay := weekDay;
    };

    public func getDownloadsByPackageNameIn(name : PackageName, duration : Time.Time, now : Time.Time, includeTempDownloads : Bool) : Nat {
      if (duration + 100 < 1 * DAY) {
        Debug.trap("duration cannot be less than 1 day");
      };

      var total = 0;
      let from = now - duration;
      let snapshots = Option.get(dailySnapshotsByPackageName.get(name), Buffer.Buffer<DownloadsSnapshot>(0));
      let snapshotsRev = Array.reverse(Buffer.toArray(snapshots));

      label l for (snapshot in snapshotsRev.vals()) {
        if (snapshot.startTime >= from) {
          total += snapshot.downloads;
        } else break l;
      };

      if (includeTempDownloads) {
        for (record in dailyTempRecords.vals()) {
          if (record.name == name and record.time >= from) {
            total += 1;
          };
        };
      };

      total;
    };

    public func getMostDownloadedPackageNames(limit : Nat) : [PackageName] {
      let arr = Iter.toArrayMut<(PackageName, Nat)>(downloadsByPackageName.entries());

      Array.sortInPlace<(PackageName, Nat)>(
        arr,
        func(a, b) {
          Nat.compare(b.1, a.1);
        },
      );

      arr
      |> Array.freeze(_)
      |> Array.take(_, limit)
      |> Array.map<(PackageName, Nat), PackageName>(
        _,
        func(item) {
          item.0;
        },
      );
    };

    public func getMostDownloadedPackageNamesIn(duration : Time.Time, now : Time.Time, limit : Nat) : [PackageName] {
      let tempDownloadsByPackageName = TrieMap.TrieMap<PackageName, Nat>(Text.equal, Text.hash);
      let from = now - duration;
      for (record in dailyTempRecords.vals()) {
        if (record.time >= from) {
          tempDownloadsByPackageName.put(record.name, Option.get(tempDownloadsByPackageName.get(record.name), 0) + 1);
        };
      };

      let iter = Iter.map<PackageName, (PackageName, Nat)>(
        downloadsByPackageName.keys(),
        func(name : PackageName) {
          let tmp = Option.get(tempDownloadsByPackageName.get(name), 0);
          (name, tmp + getDownloadsByPackageNameIn(name, duration, now, false));
        },
      );
      let arr = Iter.toArrayMut<(PackageName, Nat)>(iter);

      Array.sortInPlace(
        arr,
        func(a : (PackageName, Nat), b : (PackageName, Nat)) : Order.Order {
          Nat.compare(b.1, a.1);
        },
      );

      arr
      |> Array.freeze(_)
      |> Array.take(_, limit)
      |> Array.map<(PackageName, Nat), PackageName>(
        _,
        func(item) {
          item.0;
        },
      );
    };

    public func setTimers<system>() {
      cancelTimers();
      timerId := Timer.recurringTimer<system>(
        #nanoseconds(5 * MINUTE),
        func() : async () {
          takeSnapshotsIfNeeded(Time.now());
        },
      );
    };

    public func cancelTimers() {
      Timer.cancelTimer(timerId);
    };

    public func toStable() : Stable {
      func snapshotsToStable(snapshotsMap : TrieMap.TrieMap<Text.Text, Buffer.Buffer<DownloadsSnapshot>>) : [(Text.Text, [DownloadsSnapshot])] {
        Iter.toArray(
          Iter.map<(Text.Text, Buffer.Buffer<DownloadsSnapshot>), (Text.Text, [DownloadsSnapshot])>(
            snapshotsMap.entries(),
            func((key, buf)) {
              (key, Buffer.toArray(buf));
            },
          )
        );
      };

      ?#v3({
        totalDownloads;
        downloadsByPackageName = Iter.toArray(downloadsByPackageName.entries());
        downloadsByPackageId = Iter.toArray(downloadsByPackageId.entries());
        dailySnapshots = Buffer.toArray(dailySnapshots);
        weeklySnapshots = Buffer.toArray(weeklySnapshots);
        dailySnapshotsByPackageName = snapshotsToStable(dailySnapshotsByPackageName);
        dailySnapshotsByPackageId = snapshotsToStable(dailySnapshotsByPackageId);
        weeklySnapshotsByPackageName = snapshotsToStable(weeklySnapshotsByPackageName);
        weeklySnapshotsByPackageId = snapshotsToStable(weeklySnapshotsByPackageId);
        dailyTempRecords = Buffer.toArray(dailyTempRecords);
        weeklyTempRecords = Buffer.toArray(weeklyTempRecords);
        curSnapshotDay;
        curSnapshotWeekDay;
        timerId;
      });
    };

    public func loadStable(stab : Stable) {
      func snapshotsFromStable(snapshotsMapStable : [(Text.Text, [DownloadsSnapshot])]) : TrieMap.TrieMap<Text.Text, Buffer.Buffer<DownloadsSnapshot>> {
        let iter = Iter.map<(Text.Text, [DownloadsSnapshot]), (Text.Text, Buffer.Buffer<DownloadsSnapshot>)>(
          snapshotsMapStable.vals(),
          func((key, buf)) {
            (key, Buffer.fromArray(buf));
          },
        );
        TrieMap.fromEntries(iter, Text.equal, Text.hash);
      };

      switch (stab) {
        // v3
        case (?#v3(data)) {
          totalDownloads := data.totalDownloads;

          downloadsByPackageName := TrieMap.fromEntries<PackageName, Nat>(data.downloadsByPackageName.vals(), Text.equal, Text.hash);
          downloadsByPackageId := TrieMap.fromEntries<PackageName, Nat>(data.downloadsByPackageId.vals(), Text.equal, Text.hash);

          dailySnapshots := Buffer.fromArray<DownloadsSnapshot>(data.dailySnapshots);
          weeklySnapshots := Buffer.fromArray<DownloadsSnapshot>(data.weeklySnapshots);

          dailySnapshotsByPackageName := snapshotsFromStable(data.dailySnapshotsByPackageName);
          dailySnapshotsByPackageId := snapshotsFromStable(data.dailySnapshotsByPackageId);
          weeklySnapshotsByPackageName := snapshotsFromStable(data.weeklySnapshotsByPackageName);
          weeklySnapshotsByPackageId := snapshotsFromStable(data.weeklySnapshotsByPackageId);

          dailyTempRecords := Buffer.fromArray<Record>(data.dailyTempRecords);
          weeklyTempRecords := Buffer.fromArray<Record>(data.weeklyTempRecords);
          curSnapshotDay := data.curSnapshotDay;
          curSnapshotWeekDay := data.curSnapshotWeekDay;
          timerId := data.timerId;

          takeSnapshotsIfNeeded(Time.now());
        };
        case (null) {};
      };
    };
  };
};
