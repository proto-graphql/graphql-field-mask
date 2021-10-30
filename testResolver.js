/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path");

module.exports = (request, options) => {
  const modulesDir = path.join(__dirname, "node_modules");
  return options.defaultResolver(request, {
    ...options,
    pathFilter: (pkg, abspath, relativePath) => {
      if (pkg.name === "graphql" && process.env.GRAPHQLJS_VERSION) {
        return path.join(modulesDir, `graphql-${process.env.GRAPHQLJS_VERSION}`, relativePath);
      }
      return abspath;
    },
  });
};
