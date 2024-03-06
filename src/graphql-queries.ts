import type { Octokit, Repo } from "./types";

export async function listForks(
  octokit: Octokit,
  repo: Repo,
  cursor: string | null,
) {
  // See https://github.com/octokit/auth-token.js/blob/9c313b28c8fef7dd695b089917b50a8aea475abd/src/auth.ts#L22-L27
  const { type, token } = (await octokit.auth()) as {
    type: string;
    token: string;
  };
  return octokit.graphql<{
    repository: {
      forks: {
        nodes: {
          name: string;
          owner: {
            login: string;
          };
        }[];
        pageInfo: { endCursor: string; hasNextPage: boolean };
      };
    };
  }>(
    `
    query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        forks(privacy: PUBLIC, first: 100, after: $cursor) {
          nodes {
            name
            owner { login }
          }
          pageInfo {endCursor, hasNextPage }
        }
      }
    }
  `,
    {
      owner: repo.owner,
      repo: repo.repo,
      cursor,
      headers: { authorization: `${type} ${token}` },
    },
  );
}
