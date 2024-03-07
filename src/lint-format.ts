import * as path from "node:path";
import * as core from "@actions/core";
import { execAsync, execAsyncWithLogs } from "./utils";
import { writeFile } from "node:fs/promises";

// TODO: find a way to have shared configs for all autocomplete tools)
async function runEslintOnPath(p: string, cwd: string) {
  core.startGroup(`Started running eslint on spec: ${path.join(cwd, p)}`);
  await writeFile(path.join(cwd, ".browserslistrc"), "safari >=11\nedge >=79", {
    encoding: "utf8",
  });
  await writeFile(
    path.join(cwd, ".tmp-eslintrc"),
    '{"root": true,"extends":"@fig/autocomplete"}',
    {
      encoding: "utf8",
    },
  );
  await execAsync("npm i @fig/eslint-config-autocomplete@latest eslint@8", cwd);
  await execAsyncWithLogs(
    `npx eslint@8 --no-ignore --no-eslintrc --config .tmp-eslintrc --debug --fix ${p}`,
    cwd,
  );
  core.endGroup();
}

async function runPrettierOnPath(p: string, cwd: string) {
  core.info(`Started running prettier on spec: ${p}`);
  await execAsync(
    `npx prettier@2 ${p} --trailing-comma es5 --print-width 80 --no-config --write --parser typescript`,
    cwd,
  );
  core.info("Finished running prettier on spec file");
}

export async function lintAndFormatSpec(absolutePath: string, cwd: string) {
  const relativePath = path.relative(cwd, absolutePath);
  await runEslintOnPath(relativePath, cwd);
  await runPrettierOnPath(relativePath, cwd);
}
