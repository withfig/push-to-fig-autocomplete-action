const completionSpec: Fig.completionSpec = {
  name: "fig",
  description: "Updated description",
  subcommands: [
    {
      name: "update",
      description:
        "Updated description with lowercase letter at the beginning, trailing dot and leading spaces",
    },
    {
      name: "remove",
    },
    {
      name: "subcommand1",
      loadSpec: "cli/subcommand1",
    },
    {
      name: "subcommand2",
      loadSpec: "cli/subcommand2",
    },
  ],
};

export default completionSpec;
