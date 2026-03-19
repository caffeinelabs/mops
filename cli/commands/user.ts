import process from "node:process";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import prompts from "prompts";
import { deleteSync } from "del";
import { mainActor } from "../api/actors.js";
import { getIdentity, globalConfigDir } from "../mops.js";
import { encrypt } from "../pem.js";

export async function getUserProp(prop: string) {
  let actor = await mainActor();
  let identity = await getIdentity();
  if (!identity) {
    console.log(chalk.red("Error: ") + "No identity found");
    process.exit(1);
  }
  let res = await actor.getUser(identity.getPrincipal());
  // @ts-ignore
  console.log(res[0]?.[prop] || "");
}

export async function setUserProp(prop: string, value: string) {
  let identity = await getIdentity();
  let actor = await mainActor(identity);

  let res = await actor.setUserProp(prop, value);
  if ("ok" in res) {
    console.log(chalk.green("Success!"));
  } else {
    console.log(chalk.red("Error: ") + res.err);
  }
}

export async function getPrincipal() {
  let identity = await getIdentity();
  if (identity) {
    console.log(identity.getPrincipal().toText());
  } else {
    console.log(
      chalk.red("Error: ") +
        "identity not found. Run " +
        chalk.greenBright("mops user import") +
        " command.",
    );
  }
}

type ImportIdentityOptions = {
  encrypt: boolean;
};

export async function importPem(
  data: string,
  options: ImportIdentityOptions = { encrypt: true },
) {
  try {
    if (!fs.existsSync(globalConfigDir)) {
      fs.mkdirSync(globalConfigDir);
    }

    let password = "";

    if (options.encrypt) {
      let res = await prompts({
        type: "invisible",
        name: "password",
        message: "Enter password to encrypt identity.pem",
      });
      password = res.password;

      if (!password) {
        let res = await prompts({
          type: "confirm",
          name: "ok",
          message:
            "Are you sure you don't want to protect your identity.pem with a password?",
        });
        if (!res.ok) {
          console.log("aborted");
          return;
        }
      }
    }

    let identityPem = path.resolve(globalConfigDir, "identity.pem");
    let identityPemEncrypted = path.resolve(
      globalConfigDir,
      "identity.pem.encrypted",
    );

    deleteSync([identityPem, identityPemEncrypted], { force: true });

    // encrypted
    if (password) {
      let encrypted = await encrypt(Buffer.from(data), password);
      fs.writeFileSync(identityPemEncrypted, encrypted);
    }
    // unencrypted
    else {
      fs.writeFileSync(identityPem, data);
    }
    console.log(chalk.green("Success"));
  } catch (err) {
    console.log(chalk.red("Error: ") + err);
  }
}
