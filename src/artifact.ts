import { DefaultArtifactClient } from "@actions/artifact";
import * as path from "path";
import { readdir } from "fs/promises";

const client = new DefaultArtifactClient();

export async function uploadFilepathArtifact(name: string, filePath: string) {
  await client.uploadArtifact(name, [filePath], "/");
}

async function extractDirSubpaths(baseDir: string) {
  const dirents = await readdir(baseDir, { withFileTypes: true });
  const paths: string[] = [];
  for (const dirent of dirents) {
    if (dirent.isFile()) {
      paths.push(path.resolve(baseDir, dirent.name));
    } else if (dirent.isDirectory()) {
      paths.push(
        ...(await extractDirSubpaths(path.resolve(baseDir, dirent.name))),
      );
    }
  }
  return paths;
}

export async function uploadFolderPathArtifact(
  name: string,
  folderPath: string,
) {
  await client.uploadArtifact(name, await extractDirSubpaths(folderPath), "/");
}
