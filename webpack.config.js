const path = require('path')
const webpack = require('webpack')

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './src/main.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js'
  },
  resolve: {
    modules: [path.resolve(process.cwd(), 'src'), 'node_modules'],
    extensions: ['.js', '.json', '.ts'],
    symlinks: false,
    alias: {
      'eslint/use-at-your-own-risk': path.resolve(process.cwd(), 'node_modules', 'eslint', 'lib', 'unsupported-api.js'),
      'eslint/lib/rules': path.resolve(process.cwd(), 'node_modules', 'eslint', 'lib', 'rules')
    }
  },
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  }
}