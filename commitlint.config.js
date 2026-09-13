// Los mensajes de commit deciden la versión que se publica, así que se validan.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      // Los plugins, más los ámbitos transversales del repositorio.
      ["architecture", "craft", "testing", "security", "stack", "foundry",
       "marketplace", "release", "docs", "skills", "deps"],
    ],
    "scope-empty": [1, "never"],
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
    "body-max-line-length": [1, "always", 100],
  },
};
