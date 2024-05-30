const completionSpec: Fig.completionSpec = {
  name: "fig",
  description: "Some description",
  subcommands: [
    {
      name: "update",
      description: "Some description",
      icon: "https://path.com",
    },
    {
      name: "subcommand 1",
      loadSpec: "cli/subcommand1",
    },
  ],
};

export default completionSpec;
