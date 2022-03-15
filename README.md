<p align="center">
  <a href="https://github.com/actions/typescript-action/actions"><img alt="typescript-action status" src="https://github.com/actions/typescript-action/workflows/build-test/badge.svg"></a>
</p>


## Usage

```yml
name: 'Publish version'
on:
  push:
    tags:        
      - 'v*'
  workflow_dispatch:

jobs:
  push-to-fig-autocomplete:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v2
      - name: Generate the spec
        run:
          ## Execute commands to generate the spec through some official or third party integration
      - name: Create Autocomplete PR
          ## Create the autocomplete PR using this action
        uses: withfig/publish-to-fig-autocomplete@v1
        with:
          token: ${{ secrets.YOUR_PAT_HERE }}
          autocomplete-spec-name: generated-spec
          spec-path: path/to/generated-spec.ts
          integration: commander
  ## Other jobs not related to the spec update
```

### Supported Inputs

- `token` (required): a GitHub personal access token with repo scope
- `autocomplete-spec-name` (required): the name of the spec in the autocomplete repo in the form `[scope/]name` where name is the spec filename in the autocomplete repo. Examples:
  - if the spec relative path in the autocomplete repo is `src/npm.ts`, then `autocomplete-spec-name` is `npm`
  - if the spec relative path in the autocomplete repo is `src/@withfig/autocomplete-tools.ts`, then `autocomplete-spec-name` is `@withfig/autocomplete-tools`
- `spec-path` (required): the path of the generated spec in the current repo
- `integration`: the name of the official Fig integration used [See](https://fig.io/docs/guides/autocomplete-for-teams). Supported values: `"commander" | "oclif" | "cobra" | "clap" | "swift-argument-parser"`
- `pr-body`: set a custom PR body description

We also provide support for third party autocomplete repos via the following inputs:
- `repo-org`: name of the organization/user that stores the third party autocomplete repository (default: `withfig`)
- `repo-name`: name of the third party autocomplete repository (default: `autocomplete`)

> NOTE: third party autocomplete repos must be structured as the official autocomplete one. Run `npx @withfig/autocomplete-tools@latest init` to generate one.
