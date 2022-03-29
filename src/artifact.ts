import * as artifact from '@actions/artifact'
import * as path from 'path'
import { readdir, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'

const client = artifact.create()

export async function uploadStringArtifact(name: string, content: string) {
  const tempFileName = `${randomUUID()}.ts`
  await writeFile(tempFileName, content, { encoding: 'utf8' })
  await client.uploadArtifact(name, [tempFileName], '.')
}

export async function uploadFilePathArtifact(name: string, filePath: string) {
  await client.uploadArtifact(name, [filePath], '.')
}

async function extractDirSubpaths(baseDir: string) {
  const dirents = await readdir(baseDir, { withFileTypes: true })
  const paths: string[] = []
  for (const dirent of dirents) {
    if (dirent.isFile()) {
      paths.push(path.join(baseDir, dirent.name))
    } else if (dirent.isDirectory()) {
      paths.push(...(await extractDirSubpaths(path.join(baseDir, dirent.name))))
    }
  }
  return paths
}

export async function uploadFolderPathArtifact(
  name: string,
  folderPath: string
) {
  await client.uploadArtifact(name, await extractDirSubpaths(folderPath), '.')
}
