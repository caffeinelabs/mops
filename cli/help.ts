import { Command, Help, Option } from "commander";

export interface CommandGroup {
  title: string;
  commands: string[];
}

// Root `mops --help` groups, largely following the docs sidebar under
// `docs/docs/cli/` so a `--help` reader and a docs reader meet a similar map.
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

// Installs `MopsHelp` and usage-after-error on every command in the tree.
// `createHelp` is assigned per command rather than inherited — commander gives
// no child its parent's, however it was registered — so the walk is required.
export function installMopsHelp(cmd: Command): void {
  cmd.createHelp = () => new MopsHelp();
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
  // Commander's default texts are lowercase fragments; mops options all read as
  // sentences. Neither of these can be set at the call site.
  override optionDescription(option: Option): string {
    const description = super.optionDescription(option);
    return DEFAULT_OPTION_DESCRIPTIONS[option.description] ?? description;
  }

  // Subcommands create their own `help` copy lazily, so this has to match on the
  // default text rather than name the root's once.
  override subcommandDescription(cmd: Command): string {
    if (cmd.description() === "display help for command") {
      return "Show help for a command";
    }
    return super.subcommandDescription(cmd);
  }

  override formatHelp(cmd: Command, helper: Help): string {
    // Grouping earns its keep only on the root's long list; subcommand help
    // keeps commander's layout, which shows what each child accepts.
    if (cmd.parent) {
      return super.formatHelp(cmd, helper);
    }

    const helpWidth = helper.helpWidth ?? 80;

    // `formatItem` takes its padding and wrap budget from termWidth, so measure
    // the terms as they render — options included, since both lists share the
    // width. Commander's `padWidth` counts suffixes root entries drop, and a
    // term wider than the width it was given cannot be padded up.
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

  // `name, alias` rather than commander's `name|alias`, and without the
  // `[options]` suffix: a root entry says what a command is for.
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

    // An unfiled command lands in the catch-all rather than disappearing.
    if (ungrouped.size > 0) {
      groups.push({
        title: "Other:",
        items: [...ungrouped.values()].map(item),
      });
    }

    return groups;
  }
}
