import * as esbuild from "esbuild";

await esbuild.build({
  bundle: true,
  entryPoints: ["src/main.ts"],
  outdir: "dist",
  minify: true,
  keepNames: true,
  platform: "node",
  format: "esm",
  chunkNames: "chunks/[name]-[hash]",
  splitting: true,
  inject: ['cjs-shim.js'],
});
