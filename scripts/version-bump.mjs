import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));

packageJson.version = manifest.version;
versions[manifest.version] = manifest.minAppVersion;

writeFileSync("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync("versions.json", `${JSON.stringify(versions, null, 2)}\n`);
