import type { getOctokit } from '@actions/github'

export type Octokit = ReturnType<typeof getOctokit>

export type Repo = { owner: string; repo: string }

export interface File {
  path: string
  content: string
}
