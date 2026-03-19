// import TelegramBot "mo:telegram-bot";
// import IC "mo:ic";
// import Debug "mo:base/Debug";

// persistent actor {
//   public query func transformTelegramRequest(arg : IC.TransformArg) : async IC.HttpRequestResult {
//     TelegramBot.transformRequest(arg);
//   };

//   public func runTests() : async () {
//     let bot = TelegramBot.TelegramBot("<token>", transformTelegramRequest);

//     let config = {
//       name = "core";
//       version = "1.1.2";
//       description = "The Motoko core library";
//     };
//     let authorName = "dfinity";
//     let packageUrl = "https://mops.one/core";
//     let summary = {
//       changes = {
//         notes = "Fixed critical bug in array operations";
//       };
//     };

//     var releaseNotes = "";
//     if (summary.changes.notes != "") {
//       releaseNotes := "\n\n📄 Release notes:\n" # summary.changes.notes;
//     };

//     let message = "Package updated!\n\n📦" # config.name # " v" # config.version # " - " # config.description # "\nAuthor - " # authorName # "\nLearn more - " # packageUrl # releaseNotes;

//     let res = await bot.sendMessage("@mops_feed", TelegramBot.escapeMarkdownV2(message), null);

//     switch (res) {
//       case (#ok) {
//         Debug.print("Message sent successfully");
//       };
//       case (#err(err)) {
//         Debug.trap("Error sending message: " # err);
//       };
//     };
//   };
// };
