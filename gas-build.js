const { GasPlugin } = require("esbuild-gas-plugin");

const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["src/gas/index.ts"],
    bundle: true,
    outfile: "apps-script/bundle.js",
    plugins: [GasPlugin],
    // resolve `VERSION` variable with the value from package.json
    define: {
      VERSION: JSON.stringify(require("./package.json").version),
      LOG_LEVEL: JSON.stringify(process.env.LOG || "INFO"),
    },
  })
  .then(() => {
    // add banner to the generated file
    esbuild
      .build({
        entryPoints: ["apps-script/bundle.js"],
        outfile: "apps-script/bundle.js",
        allowOverwrite: true,
        banner: {
          js: "//This file is generated by gas-build.js",
        },
      })
      .catch((e) => {
        console.error(e)
        process.exit(1)
      });
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  });
