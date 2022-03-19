import * as artifact from '@actions/artifact'
import { randomUUID } from 'crypto'
import { writeFile } from 'fs/promises'

const client = artifact.create()

export async function uploadStringArtifact(name: string, content: string) {
  const tempFileName = `${randomUUID()}.ts`
  await writeFile(tempFileName, content, { encoding: 'utf8' })
  await client.uploadArtifact(name, [tempFileName], '.')
}

export async function uploadPathArtifact(name: string, path: string) {
  await client.uploadArtifact(name, [path], '.')
}
