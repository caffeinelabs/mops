import { Command, Help, Option } from "commander";

export interface CommandGroup {
  title: string;
  commands: string[];
}

// Root `mops --help` groups. The categories follow the docs sidebar under
// `docs/docs/cli/` (which files `init` outside the categories), so a user who
// reads `--help` and a user who reads the docs meet the same mental map. Every
// top-level command belongs to exactly one group — `cli/tests/help.test.ts`
// enforces that, and `MopsHelp` prints anything unfiled under a catch-all
// "Other:" rather than dropping it.
export const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: "Start a project:",
    commands: ["init", "template"],
  },
  {
    title: "Manage dependencies:",
    commands: [
      "add",
      "remove",
      "install",
      "outdated",
      "update",
      "sync",
      "verify",
    ],
  },
  {
    title: "Publish a package:",
    commands: ["publish", "bump", "owner", "maintainer"],
  },
  {
    title: "User:",
    commands: ["user"],
  },
  {
    title: "Development:",
    commands: [
      "test",
      "watch",
      "bench",
      "format",
      "build",
      "check",
      "check-stable",
      "check-candid",
      "lint",
      "migrate",
      "generate",
      "deployed",
      "docs",
    ],
  },
  {
    title: "Toolchain management:",
    commands: ["toolchain"],
  },
  {
    title: "Mops CLI management:",
    commands: ["self"],
  },
  {
    title: "Miscellaneous:",
    commands: ["search", "info", "cache", "sources", "moc-args", "help"],
  },
];

// Every command renders through `MopsHelp`, at every depth, and prints its own
// usage after a usage error. The `createHelp` assignment has to happen here
// rather than be inherited: it propagates from a parent only to subcommands
// registered with `.command("name")`, and the grouped parents (`mops cache`,
// `mops toolchain`, …) are built with `addCommand`, which adds no inheritance.
// Walking the tree also covers depth beyond the root's children — `mops docs
// generate` — without each site repeating the wiring.
export function installMopsHelp(cmd: Command): void {
  cmd.createHelp = () => new MopsHelp();
  // `error: missing required argument 'pkg'` on its own leaves a user with
  // nowhere to go; the usage block names the argument they owe and the flags
  // that exist. A bare invocation of a command group needs no help here —
  // commander prints the listing and exits 1 on its own when a parent with
  // subcommands and no handler is given no arguments.
  cmd.showHelpAfterError();
  for (const child of cmd.commands) {
    installMopsHelp(child);
  }
}

/** Commander's own flag descriptions, which read as fragments next to the
 *  sentence-case descriptions every mops option carries. */
const DEFAULT_OPTION_DESCRIPTIONS: Record<string, string> = {
  "display help for command": "Show help",
};

export class MopsHelp extends Help {
  // The `-h, --help` option is registered by commander on every command, so it
  // cannot be re-described at the call site the way a mops option can. Its
  // default text is a lowercase fragment ("display help for command") sitting
  // in a list of sentences, and `subcommandDescription` has the command
  // equivalent covered — this is the option half.
  override optionDescription(option: Option): string {
    const description = super.optionDescription(option);
    return DEFAULT_OPTION_DESCRIPTIONS[option.description] ?? description;
  }

  // Commander's own `help` command carries the lowercase fragment "display
  // help for command", and subcommands create their own copy lazily, before a
  // `helpCommand()` call on the root can be inherited — so it is not enough to
  // name it once at the root. Matching on the default text leaves a
  // user-defined command that happens to be called `help` alone.
  override subcommandDescription(cmd: Command): string {
    if (cmd.description() === "display help for command") {
      return "Show help for a command";
    }
    return super.subcommandDescription(cmd);
  }

  override formatHelp(cmd: Command, helper: Help): string {
    // Grouping only earns its keep on the root's long list. Subcommand help
    // (`mops cache --help`) keeps commander's layout, which shows the
    // arguments and options each child accepts — worth more there than a name.
    if (cmd.parent) {
      return super.formatHelp(cmd, helper);
    }

    const helpWidth = helper.helpWidth ?? 80;

    // `formatItem` derives its padding *and* its wrap budget from the termWidth
    // it is handed, so measure the terms as they will actually render — and
    // across the options too, since both lists share the one width. Taking
    // commander's own `padWidth` would count the `[options]` and `<args>`
    // suffixes root entries drop, and a term wider than the width it was given
    // cannot be padded up, leaving that column ragged.
    const termWidth = Math.max(
      0,
      ...helper
        .visibleCommands(cmd)
        .map((command) => helper.displayWidth(this.commandTerm(command))),
      ...helper
        .visibleOptions(cmd)
        .map((option) => helper.displayWidth(helper.optionTerm(option))),
    );

    const formatItem = (term: string, description: string) =>
      helper.formatItem(term, termWidth, description, helper);

    let output = [
      `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
      "",
    ];

    const commandDescription = helper.commandDescription(cmd);
    if (commandDescription.length > 0) {
      output = output.concat([
        helper.boxWrap(
          helper.styleCommandDescription(commandDescription),
          helpWidth,
        ),
        "",
      ]);
    }

    for (const group of this.groupCommands(cmd, helper, formatItem)) {
      output = output.concat([helper.styleTitle(group.title), ...group.items]);
      output.push("");
    }

    const optionList = helper
      .visibleOptions(cmd)
      .map((option) =>
        formatItem(
          helper.styleOptionTerm(helper.optionTerm(option)),
          helper.styleOptionDescription(helper.optionDescription(option)),
        ),
      );
    if (optionList.length > 0) {
      output = output.concat([
        helper.styleTitle("Options:"),
        ...optionList,
        "",
      ]);
    }

    return output.join("\n");
  }

  // `name, alias`, not commander's `name|alias`, and never the `[options]` and
  // `<args>` suffix `subcommandTerm` appends: a root entry says what a command
  // is for, and `mops <command> --help` says what it takes.
  private commandTerm(cmd: Command): string {
    const aliases = cmd.aliases();
    return [cmd.name(), ...aliases].join(", ");
  }

  private groupCommands(
    cmd: Command,
    helper: Help,
    formatItem: (term: string, description: string) => string,
  ): { title: string; items: string[] }[] {
    const visible = helper.visibleCommands(cmd);
    const ungrouped = new Map(
      visible.map((command) => [command.name(), command]),
    );

    const item = (command: Command) =>
      formatItem(
        helper.styleSubcommandTerm(this.commandTerm(command)),
        helper.styleSubcommandDescription(
          helper.subcommandDescription(command),
        ),
      );

    const groups: { title: string; items: string[] }[] = [];
    for (const group of COMMAND_GROUPS) {
      const items: string[] = [];
      for (const name of group.commands) {
        const command = ungrouped.get(name);
        if (command) {
          ungrouped.delete(name);
          items.push(item(command));
        }
      }
      if (items.length > 0) {
        groups.push({ title: group.title, items });
      }
    }

    // A command nobody filed still has to be discoverable, so it lands in a
    // catch-all instead of disappearing from `--help`.
    if (ungrouped.size > 0) {
      groups.push({
        title: "Other:",
        items: [...ungrouped.values()].map(item),
      });
    }

    return groups;
  }
}
