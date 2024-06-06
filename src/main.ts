import * as core from "@actions/core";
import * as github from "@actions/github";
import * as path from "node:path";
import type { FileOrFolder, Repo } from "./types";
import { execFileAsync, mergeSpecs, timeout } from "./utils";
import { uploadFilepathArtifact, uploadFolderPathArtifact } from "./artifact";
import { AutocompleteRepoManager } from "./autocomplete-repo-manager";
import { TMP_AUTOCOMPLETE_SRC_MOCK, TMP_FOLDER } from "./constants";
import { getDefaultBranch } from "./git-utils";
import { lintAndFormatSpec } from "./lint-format";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";

async function run(): Promise<void> {
  try {
    const token = core.getInput("token", { required: true });
    const autocompleteSpecName = core.getInput("autocomplete-spec-name", {
      required: true,
    });
    // The local path of the new spec relative to the repo root e.g. `fig_cli/generated-fig.ts`
    const newSpecPathInRepo = core.getInput("spec-path", { required: true });
    const newSpecFolderPathInRepo = core.getInput("spec-folder-path");
    const repoOrg = core.getInput("repo-org");
    const repoName = core.getInput("repo-name");
    const diffBasedVersioning =
      core.getBooleanInput("diff-based-versioning") ?? false;

    const octokit = github.getOctokit(token);

    const repo: Repo = {
      repo: repoName,
      owner: repoOrg,
    };
    const autocompleteRepoManager = new AutocompleteRepoManager(
      repo,
      await getDefaultBranch(octokit, repo),
      octokit,
    );

    core.info(
      `Target autocomplete repo: ${JSON.stringify(
        autocompleteRepoManager.repo,
      )}`,
    );

    if (!existsSync(TMP_AUTOCOMPLETE_SRC_MOCK)) {
      await mkdir(TMP_AUTOCOMPLETE_SRC_MOCK, { recursive: true });
    }

    // The path to the spec copied to the temp directory
    const newSpecPath = path.join(
      TMP_AUTOCOMPLETE_SRC_MOCK,
      `${randomUUID()}.ts`,
    );
    // this is the local path of the updated spec: it will be either a TS file for old-style specs or a folder for diff-versioned.
    const localSpecFileOrFolder: FileOrFolder[] = [];
    // Run eslint and prettier on top of the generated spec and report eventual errors
    await copyFile(path.resolve(newSpecPathInRepo), newSpecPath);
    await lintAndFormatSpec(newSpecPath, TMP_FOLDER);
    await uploadFilepathArtifact(`new-spec-${randomUUID()}.ts`, newSpecPath);

    if (!diffBasedVersioning) {
      // check if spec already exist in autocomplete repo, if it does => run merge tool and merge it
      const oldSpecPath = path.join(TMP_AUTOCOMPLETE_SRC_MOCK, "old-spec.ts");
      const successfullyClonedSpecFile =
        await autocompleteRepoManager.cloneFile(
          `src/${autocompleteSpecName}.ts`,
          oldSpecPath,
        );

      const mergedSpecPath = path.join(
        TMP_AUTOCOMPLETE_SRC_MOCK,
        "merged-spec.ts",
      );

      if (successfullyClonedSpecFile) {
        await uploadFilepathArtifact(
          `old-spec-${randomUUID()}.ts`,
          oldSpecPath,
        );
        await mergeSpecs(oldSpecPath, newSpecPath, mergedSpecPath, TMP_FOLDER);
        await uploadFilepathArtifact(
          `merged-spec-${randomUUID()}.ts`,
          mergedSpecPath,
        );
      }

      localSpecFileOrFolder.push({
        localPath: successfullyClonedSpecFile ? mergedSpecPath : newSpecPath,
        repoPath: `src/${autocompleteSpecName}.ts`,
      });

      if (newSpecFolderPathInRepo) {
        const newSpecFolderPath = path.join(
          TMP_AUTOCOMPLETE_SRC_MOCK,
          `${autocompleteSpecName}-${randomUUID()}`,
        );

        await cp(path.resolve(newSpecFolderPathInRepo), newSpecFolderPath, {
          recursive: true,
        });

        const localSpecFolder = path.join(
          TMP_AUTOCOMPLETE_SRC_MOCK,
          autocompleteSpecName,
        );

        const successfullyClonedSpecFolder =
          await autocompleteRepoManager.cloneSpecFolder(
            `src/${autocompleteSpecName}`,
            localSpecFolder,
          );

        if (successfullyClonedSpecFolder) {
          await uploadFolderPathArtifact(
            `old-spec-folder-${randomUUID()}`,
            localSpecFolder,
          );

          for (const file of await readdir(newSpecFolderPath)) {
            if (existsSync(path.join(localSpecFolder, file))) {
              core.startGroup(`Merging ${file}`);
              await mergeSpecs(
                path.resolve(path.join(localSpecFolder, file)),
                path.resolve(path.join(newSpecFolderPath, file)),
                path.resolve(path.join(newSpecFolderPath, file)),
                TMP_FOLDER,
                {
                  skipLintAndFormat: true,
                },
              );
              core.endGroup();
            }
          }
        }

        await lintAndFormatSpec(newSpecFolderPath, TMP_FOLDER);
        await uploadFolderPathArtifact(
          `new-spec-folder-${randomUUID()}`,
          newSpecFolderPath,
        );

        localSpecFileOrFolder.push({
          repoPath: `src/${autocompleteSpecName}`,
          localPath: newSpecFolderPath,
        });
      }
    } else {
      const newSpecVersion = core.getInput("new-spec-version");
      const useMinorBase = core.getBooleanInput("use-minor-base");
      if (!newSpecVersion) {
        throw new Error(
          "You need to specify `new-spec-version` when using `diff-based-versioning: true`",
        );
      }

      const localSpecFolder = path.join(
        TMP_AUTOCOMPLETE_SRC_MOCK,
        autocompleteSpecName,
      );
      const successfullyClonedSpecFolder =
        await autocompleteRepoManager.cloneSpecFolder(
          `src/${autocompleteSpecName}`,
          localSpecFolder,
        );

      if (successfullyClonedSpecFolder) {
        await uploadFolderPathArtifact(
          `old-spec-folder-${randomUUID()}`,
          localSpecFolder,
        );
      } else {
        // spec-folder does not exist in autocomplete repo so we create a new one locally and then upload to the autocomplete repo
        await execFileAsync("npx", [
          "@withfig/autocomplete-tools@2",
          "version",
          "init-spec",
          autocompleteSpecName,
          "--cwd",
          TMP_AUTOCOMPLETE_SRC_MOCK,
        ]);
      }

      await execFileAsync("npx", [
        "@withfig/autocomplete-tools@2",
        "version",
        "add-diff",
        ...(useMinorBase ? ["--use-minor-base"] : []),
        autocompleteSpecName,
        newSpecPath,
        newSpecVersion,
        "--cwd",
        TMP_AUTOCOMPLETE_SRC_MOCK,
      ]);

      await lintAndFormatSpec(localSpecFolder, TMP_FOLDER);

      localSpecFileOrFolder.push({
        repoPath: `src/${autocompleteSpecName}`,
        localPath: localSpecFolder,
      });
    }

    // create autocomplete fork
    const basePRsBranchName = `auto-update/${autocompleteSpecName}`;
    const autocompleteFork =
      await autocompleteRepoManager.checkOrCreateFork(basePRsBranchName);

    // commit the file to a new branch on the autocompletefork
    const newBranchName = `${basePRsBranchName}/${randomUUID()}`;
    const commitHasDiff =
      await autocompleteRepoManager.createCommitOnForkNewBranch(
        autocompleteFork,
        newBranchName,
        localSpecFileOrFolder,
      );

    if (commitHasDiff) {
      // skip 1s because github returns a validation error otherwise (commit is sync)
      await timeout(1000);
      // create a PR from the branch with changes
      const createdPRNumber =
        await autocompleteRepoManager.createAutocompleteRepoPR(
          autocompleteSpecName,
          autocompleteFork.owner,
          newBranchName,
        );
      core.setOutput("pr-number", createdPRNumber);
    } else {
      core.info("No diffs found between old and new specs");
    }
  } catch (error) {
    core.error(
      `${(error as Error).name}: ${(error as Error).message}\n\n${
        (error as Error).stack
      }`,
    );
    if (error instanceof Error || typeof error === "string") {
      core.setFailed(error);
    } else {
      core.setFailed(`${error}`);
    }
  }
}

run();
