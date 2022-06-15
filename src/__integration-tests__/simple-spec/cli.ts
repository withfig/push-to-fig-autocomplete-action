const completionSpec: Fig.completionSpec = {
  name: "fig",
  description: "updated description",
  subcommands: [
    {
      name: "update",
      description:
        "   updated description with lowercase letter at the beginning, trailing dot and leading spaces.",
      icon: "https://path.com",
    },
    {
      name: "remove",
    },
  ],
};
export default completionSpec;
