const completionSpec: Fig.completionSpec = {
  name: "fig",
  description: "Updated description",
  subcommands: [
    {
      name: "update",
      description:
        "Updated description with lowercase letter at the beginning, trailing dot and leading spaces",
      icon: "https://path.com",
    },
    {
      name: "remove",
    },
  ],
};
export default completionSpec;
