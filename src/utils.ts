import * as core from "@actions/core";
import { PresetName, merge } from "@fig/autocomplete-merge";
import { mkdir, readFile, writeFile } from "fs/promises";
import { File } from "./types";
import { exec } from "child_process";
import { existsSync } from "fs";
import { lintAndFormatSpec } from "./lint-format";

export async function mergeSpecs(
  oldSpecFilepath: string,
  newSpecFilepath: string,
  mergedSpecFilepath: string,
  cwd: string,
): Promise<void> {
  const integration = core.getInput("integration") as PresetName;
  core.startGroup("Merge specs");

  core.info("Started running merge tool...");
  const oldSpecContent = await readFile(oldSpecFilepath, { encoding: "utf8" });
  const newSpecContent = await readFile(newSpecFilepath, { encoding: "utf8" });
  const mergedSpecContent = merge(oldSpecContent, newSpecContent, {
    ...(integration && { preset: integration }),
    prettifyOutput: false,
  });
  await writeFile(mergedSpecFilepath, mergedSpecContent, { encoding: "utf8" });
  await lintAndFormatSpec(mergedSpecFilepath, cwd);
  core.endGroup();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isFile(value: any): value is File {
  return !Array.isArray(value) && value.type === "file";
}

export async function timeout(time: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve(() => {});
    }, time);
  });
}

export async function execAsync(
  command: string,
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  const trimmed = (b: string): string => String(b).trim();

  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve({ stdout: trimmed(stdout), stderr: trimmed(stderr) });
    });
  });
}

export async function mkdirIfNotExists(
  ...args: Parameters<typeof mkdir>
): Promise<void> {
  if (!existsSync(args[0])) {
    await mkdir(...args);
  }
}
