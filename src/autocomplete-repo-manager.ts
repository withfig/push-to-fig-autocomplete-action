import * as core from "@actions/core";
import * as path from "path";
import type { FileOrFolder, Octokit, OctokitError, Repo } from "./types";
import { createFileBlob, createFolderBlobs } from "./git-utils";
import { isFile, mkdirIfNotExists, timeout } from "./utils";
import { listForks } from "./graphql-queries";
import { writeFile, stat } from "fs/promises";

export class AutocompleteRepoManagerError extends Error {}

export class AutocompleteRepoManager {
  private declare autocompleteRepo: Repo;
  private declare autocompleteDefaultBranch: string;
  /**
   * This octokit instance won't be the one of the user holding the `autocompleteRepo`, but
   * of the user who is trying to push an update to the `autocompleteRepo`
   */
  private declare octokit: Octokit;

  get repo() {
    return {
      ...this.autocompleteRepo,
      defaultBranch: this.autocompleteDefaultBranch,
    };
  }

  constructor(
    autocompleteRepo: Repo,
    autocompleteDefaultBranch: string,
    octokit: Octokit,
  ) {
    this.autocompleteRepo = autocompleteRepo;
    this.autocompleteDefaultBranch = autocompleteDefaultBranch;
    this.octokit = octokit;
  }

  /**
   * @returns if commit has diff from the previous one
   */
  async createCommitOnForkNewBranch(
    fork: Repo,
    branchName: string,
    localSpecFileOrFolder: FileOrFolder[],
  ): Promise<boolean> {
    core.startGroup("commit");
    // create new branch on top of the upstream master
    const masterRef = await this.octokit.rest.git.getRef({
      ...fork,
      ref: `heads/${this.autocompleteDefaultBranch}`,
    });

    const lastMainBranchCommit = await this.octokit.rest.repos.listCommits({
      ...fork,
      per_page: 1,
      page: 1,
    });

    // create new branch
    await this.octokit.rest.git.createRef({
      ...fork,
      ref: `refs/heads/${branchName}`,
      sha: masterRef.data.object.sha,
    });

    core.info(`Created a new branch on the fork: refs/heads/${branchName}`);

    // create new blob, new tree, commit everything and update PR branch
    const blobs = [];
    for (const fileOrFolder of localSpecFileOrFolder) {
      const stats = await stat(fileOrFolder.localPath);
      if (stats.isFile()) {
        blobs.push(await createFileBlob(this.octokit, fork, fileOrFolder));
      } else if (stats.isDirectory()) {
        blobs.push(
          ...(await createFolderBlobs(this.octokit, fork, fileOrFolder)),
        );
      } else {
        throw new AutocompleteRepoManagerError(
          `Invalid file or folder: ${fileOrFolder.localPath}`,
        );
      }
    }

    const newTree = await this.octokit.rest.git.createTree({
      ...fork,
      tree: blobs,
      base_tree: lastMainBranchCommit.data[0].commit.tree.sha,
    });

    const newCommit = await this.octokit.rest.git.createCommit({
      ...fork,
      message: "feat: update spec",
      tree: newTree.data.sha,
      parents: [lastMainBranchCommit.data[0].sha],
    });

    core.info(`Created new commit: ${newCommit.data.sha}`);

    await this.octokit.rest.git.updateRef({
      ...fork,
      ref: `heads/${branchName}`,
      sha: newCommit.data.sha,
      force: true,
    });

    const hasChanges =
      (
        (
          await this.octokit.rest.repos.compareCommitsWithBasehead({
            ...fork,
            basehead: `${lastMainBranchCommit.data[0].sha}...${newCommit.data.sha}`,
          })
        ).data.files ?? []
      ).length > 0;

    core.info("Updated the created branch to point to the new commit");
    core.endGroup();

    return hasChanges;
  }

  async createAutocompleteRepoPR(
    specName: string,
    forkOwner: string,
    branchName: string,
  ) {
    const prBody =
      core.getInput("pr-body") ||
      "PR generated automatically from push-to-fig-autocomplete-action.";
    // create a new branch in the fork and create
    const result = await this.octokit.rest.pulls.create({
      ...this.autocompleteRepo,
      title: `feat(${specName}): update spec`,
      head: `${forkOwner}:${branchName}`,
      base: this.autocompleteDefaultBranch,
      body: prBody,
    });
    core.info(
      `Created target autocomplete repo PR (#${result.data.number}) from branch ${forkOwner}:${branchName}`,
    );

    return result.data.number;
  }

  /**
   * Rebase an autocomplete fork on top of the current autocomplete default branch
   */
  private async rebaseForkOnDefaultBranch(fork: Repo) {
    core.info("Started rebasing fork...");
    await this.octokit.rest.repos.mergeUpstream({
      ...fork,
      branch: this.autocompleteDefaultBranch,
      merge_type: "fast-forward",
    });
    core.info("Finished rebasing fork");
  }

  private async removePreviousBranches(fork: Repo, branchPrefix: string) {
    const branches = await this.octokit.rest.repos.listBranches({
      ...fork,
      per_page: 100,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const branchesToRemove: Promise<any>[] = [];
    for (const branch of branches.data) {
      if (branch.name.startsWith(branchPrefix)) {
        branchesToRemove.push(
          this.octokit.rest.git.deleteRef({
            ...fork,
            ref: `heads/${branch.name}`,
          }),
        );
      }
    }
    await Promise.all(branchesToRemove);
  }

  private async sanitizeFork(fork: Repo, basePRsBranchName: string) {
    core.info("A fork of the target autocomplete repo already exists");
    await this.rebaseForkOnDefaultBranch(fork);
    await this.removePreviousBranches(fork, basePRsBranchName);
    return fork;
  }

  private async *listForks() {
    let cursor: string | null = null;
    while (true) {
      const {
        repository: {
          forks: { nodes, pageInfo },
        },
      } = await listForks(this.octokit, this.autocompleteRepo, cursor);
      yield* nodes;
      if (!pageInfo.hasNextPage) return;
      cursor = pageInfo.endCursor;
    }
  }

  /**
   * Checks if a fork of the autocomplete repo already exists or it creates a new one for the current user
   */
  async checkOrCreateFork(basePRsBranchName: string): Promise<Repo> {
    const user = await this.octokit.rest.users.getAuthenticated();
    core.info(`Authenticated user: ${user.data.login}`);

    // check if the authenticated user has a fork of the autocomplete repo with the same name as the default autocomplete
    try {
      const possibleForkData = {
        owner: user.data.login,
        repo: this.autocompleteRepo.repo,
      };
      const {
        data: { parent },
      } = await this.octokit.rest.repos.get(possibleForkData);
      if (
        parent?.owner.login === this.autocompleteRepo.owner &&
        parent?.name === this.autocompleteRepo.repo
      ) {
        return await this.sanitizeFork(possibleForkData, basePRsBranchName);
      }
      // eslint-disable-next-line no-empty
    } catch {}

    // otherwise check all the forks of the target autocomplete
    for await (const fork of this.listForks()) {
      if (fork.owner.login === user.data.login) {
        return await this.sanitizeFork(
          {
            owner: fork.owner.login,
            repo: fork.name,
          },
          basePRsBranchName,
        );
      }
    }

    // if still no fork has been found create a new one
    const createdFork = await this.octokit.rest.repos.createFork(
      this.autocompleteRepo,
    );
    await timeout(15_000); // wait 15 seconds to let github create the new repo (it may take longer and require the action to be rerun)
    core.info(
      `Created fork: ${createdFork.data.owner.login}/${createdFork.data.name}`,
    );

    return { owner: user.data.login, repo: createdFork.data.name };
  }

  /**
   * Gets a spec file from the autocomplete repo
   * @param octokit the Octokit object
   * @param repoFilepath a path of a file in the repo
   * @param destinationPath the file path in which to write the `repoFilepath` file
   */
  async cloneFile(repoFilepath: string, destinationPath: string) {
    core.startGroup("Starting to clone file...");
    core.info(
      `Cloning ${repoFilepath} from repo: ${JSON.stringify(
        this.autocompleteRepo,
      )} into ${destinationPath}`,
    );
    let fileData;
    try {
      core.info("Started fetching file content...");
      fileData = await this.octokit.rest.repos.getContent({
        ...this.autocompleteRepo,
        path: repoFilepath,
      });
      core.info("Finished fetching file content");
    } catch (error) {
      if ((error as OctokitError).status === 404) {
        core.info("File not found in autocomplete repo");
        core.endGroup();
        return false;
      }
      throw error;
    }
    if (!isFile(fileData.data)) {
      throw new Error(
        `autocomplete-spec-name: ${repoFilepath} does not correspond to a valid file`,
      );
    }

    await mkdirIfNotExists(path.dirname(destinationPath), { recursive: true });
    core.info(`Started writing file...`);
    await writeFile(
      destinationPath,
      Buffer.from(fileData.data.content, "base64").toString(),
      { encoding: "utf8" },
    );
    core.info(`Finished writing file`);
    core.endGroup();
    return true;
  }

  /**
   * Gets a spec folder from the autocomplete repo
   * @param octokit the Octokit object
   * @param repoFolderPath the path of a folder in the repo
   * @param destinationFolderPath the local directory in which to write the contents of the `repoFolderPath` directory
   */
  async cloneSpecFolder(repoFolderPath: string, destinationFolderPath: string) {
    core.startGroup("Starting to clone folder...");
    core.info(
      `Cloning ${repoFolderPath} from repo: ${JSON.stringify(
        this.autocompleteRepo,
      )} into ${destinationFolderPath}`,
    );
    let folderData;
    try {
      core.info("Started fetching file content...");
      folderData = (
        await this.octokit.rest.repos.getContent({
          ...this.autocompleteRepo,
          path: repoFolderPath,
        })
      ).data;
      core.info("Finished fetching file content");
    } catch (error) {
      if ((error as OctokitError).status === 404) {
        core.info("Folder not found in autocomplete repo");
        core.endGroup();
        return false;
      }
      throw error;
    }

    if (!Array.isArray(folderData)) {
      // this may only be reached by the first iteration
      throw new Error(
        `autocomplete-spec-name: ${repoFolderPath} does not correspond to a valid spec folder`,
      );
    }

    await mkdirIfNotExists(destinationFolderPath, { recursive: true });

    for (const item of folderData) {
      if (item.type === "dir") {
        core.info(`Object at ${item.path} is a folder`);
        await this.cloneSpecFolder(
          item.path,
          path.join(destinationFolderPath, item.name),
        );
      } else if (item.type === "file") {
        core.info(`Object at ${item.path} is a file`);
        await this.cloneFile(
          item.path,
          path.join(destinationFolderPath, item.name),
        );
      }
    }
    core.endGroup();
    return true;
  }
}
