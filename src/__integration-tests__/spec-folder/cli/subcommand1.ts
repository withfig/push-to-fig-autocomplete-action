const completionSpec: Fig.Spec = {
  name: "subcommand 1",
  description: "Some description",
  subcommands: [
    {
      name: "blah",
      description: " updated description ",
    },
    {
      name: "new",
    },
  ],
};

export default completionSpec;