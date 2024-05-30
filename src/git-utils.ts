import * as github from "@actions/github";
import * as core from "@actions/core";
import * as path from "node:path";
import type { Blob, FileOrFolder, Octokit, Repo } from "./types";
import { readFile, readdir } from "node:fs/promises";
import { sleep } from "./utils";

export async function getDefaultBranch(
  octokit: Octokit,
  repo: typeof github.context.repo,
) {
  return (await octokit.rest.repos.get(repo)).data.default_branch;
}

export async function createFileBlob(
  octokit: Octokit,
  repo: Repo,
  filePath: FileOrFolder,
): Promise<Blob> {
  core.info(`Creating blob for ${filePath.localPath}`);
  const newBlob = await octokit.rest.git.createBlob({
    ...repo,
    content: await readFile(filePath.localPath, {
      encoding: "utf8",
    }),
    encoding: "utf-8",
  });
  core.info(`Created blob for ${filePath.localPath}: ${newBlob.data.sha}`);

  // sleep for 1 second to avoid rate limiting
  await sleep(1000);

  return {
    path: filePath.repoPath,
    sha: newBlob.data.sha,
    mode: "100644",
    type: "blob",
  };
}

export async function createFolderBlobs(
  octokit: Octokit,
  repo: Repo,
  basePath: FileOrFolder,
): Promise<Blob[]> {
  const dirents = await readdir(basePath.localPath, {
    withFileTypes: true,
  });
  const blobs = [];
  for (const dirent of dirents) {
    const direntPath: FileOrFolder = {
      localPath: path.join(basePath.localPath, dirent.name),
      repoPath: path.join(basePath.repoPath, dirent.name),
    };
    if (dirent.isFile()) {
      blobs.push(await createFileBlob(octokit, repo, direntPath));
    } else if (dirent.isDirectory()) {
      blobs.push(...(await createFolderBlobs(octokit, repo, direntPath)));
    }
  }
  return blobs;
}
