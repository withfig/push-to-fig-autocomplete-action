import * as core from "@actions/core";
import { merge, type PresetName } from "@fig/autocomplete-merge";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { File } from "./types";
import { execFile, type ExecFileOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { lintAndFormatSpec } from "./lint-format";
import { promisify } from "node:util";

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

export async function execFileAsync(
  file: string,
  args: readonly string[] | undefined | null,
  options?: ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await promisify(execFile)(
    file,
    args,
    options ?? {},
  );
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

export async function execFileAsyncWithLogs(
  file: string,
  args: readonly string[] | undefined | null,
  options?: ExecFileOptions,
): Promise<void> {
  return new Promise((resolve) => {
    const child = execFile(file, args, options ?? {}, () => {
      resolve();
    });
    child.stdout?.on("data", function (data) {
      core.info(data);
    });
    child.stderr?.on("data", function (data) {
      core.info(data);
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
