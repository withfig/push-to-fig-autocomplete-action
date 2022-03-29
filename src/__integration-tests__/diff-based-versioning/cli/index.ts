import { generator } from './generators'

const completionSpec: Fig.completionSpec = {
  name: "fig",
  description: "Description",
  subcommands: [{
    name: "remove",
    args: { generators: [generator] }
  }],
}

export default completionSpec