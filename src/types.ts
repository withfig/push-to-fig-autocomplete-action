import type { getOctokit } from '@actions/github'

export type Octokit = ReturnType<typeof getOctokit>

export interface OctokitError {
  name: string
  status: number
  documentation_url: string
  errors?: {
    resource: string
    code: string
    field: string
    message?: string
  }[]
}

export type Repo = { owner: string; repo: string }

export type Blob = {
  path?: string
  mode?: '100644' | '100755' | '040000' | '160000' | '120000'
  type?: 'blob' | 'tree' | 'commit'
  sha?: string | null
  content?: string
}

export interface File {
  path: string
  content: string
}
