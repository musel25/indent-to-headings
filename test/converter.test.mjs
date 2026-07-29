import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

await mkdir(".tmp", { recursive: true });
await esbuild.build({
  bundle: true,
  entryPoints: ["src/converter.ts"],
  format: "esm",
  outfile: ".tmp/converter.mjs",
  platform: "node",
  target: "es2022",
});

const {
  DEFAULT_SETTINGS,
  convertIndentedOutline,
} = await import(pathToFileURL(`${process.cwd()}/.tmp/converter.mjs`));

const settings = { ...DEFAULT_SETTINGS };

function convert(text, overrides = {}, options = {}) {
  return convertIndentedOutline(text, { ...settings, ...overrides }, options).text;
}

assert.equal(
  convert("Project plan\n\tResearch\n\t\tRead papers\n\t\tCollect notes\n\tBuild\n\t\tPrototype\n\t\tTest"),
  "# Project plan\n## Research\nRead papers\nCollect notes\n## Build\nPrototype\nTest"
);

assert.equal(
  convert("# Project plan\n## Research\nRead papers\nCollect notes\n## Build\nPrototype\nTest"),
  "# Project plan\n## Research\nRead papers\nCollect notes\n## Build\nPrototype\nTest"
);

assert.equal(
  convert("# Project plan\n## Build\nPrototype\nTest\nFuture\n  Deploy\n  Review"),
  "# Project plan\n## Build\nPrototype\nTest\n## Future\nDeploy\nReview"
);

assert.equal(
  convert("# Project plan\n## Research\nRead papers\n  Source A\n  Source B"),
  "# Project plan\n## Research\n### Read papers\nSource A\nSource B"
);

assert.equal(
  convert("Topic\n  - thing one\n  - [ ] thing two"),
  "# Topic\n- thing one\n- [ ] thing two"
);

assert.equal(
  convert("Topic\n  thing one\n  thing two", { leafTextStyle: "bullet", preserveLeafListMarkers: false }),
  "# Topic\n- thing one\n- thing two"
);

assert.equal(
  convert("Topic\n  only child", { minimumChildrenForHeading: 2 }),
  "Topic\n  only child"
);

assert.equal(
  convert("Topic\n  first\n  second", { minimumChildrenForHeading: 2 }),
  "# Topic\nfirst\nsecond"
);

assert.equal(
  convert("```txt\nProject\n  Build\n```\nOutside\n  Child"),
  "```txt\nProject\n  Build\n```\n# Outside\nChild"
);

assert.equal(
  convert("Before\n<!-- indent-to-headings:start -->\nProject\n  Build\n<!-- indent-to-headings:end -->\nAfter", {}, { onlyMarkedBlocks: true }),
  "Before\n<!-- indent-to-headings:start -->\n# Project\nBuild\n<!-- indent-to-headings:end -->\nAfter"
);

assert.equal(
  convert("Before\n<!-- indent-to-headings:start -->\nProject\n  Build\n<!-- indent-to-headings:end -->\nAfter", { preferMarkedBlocks: true }),
  "Before\n<!-- indent-to-headings:start -->\n# Project\nBuild\n<!-- indent-to-headings:end -->\nAfter"
);

console.log("converter tests passed");
