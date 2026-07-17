import { cp, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const nativeRoot = path.join(root, "native-site")
const outputRoot = path.join(root, "public")

function runQuartz(extraArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "quartz", "bootstrap-cli.mjs"), "build", ...extraArgs],
      { cwd: root, stdio: "inherit" },
    )
    child.once("error", reject)
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Quartz exited with status ${code}`)),
    )
  })
}

const extraArgs = process.argv.slice(2)
if (extraArgs.includes("--serve")) {
  throw new Error("Use `npm run dev` for the hybrid development server.")
}

await runQuartz(extraArgs)

for (const entry of await readdir(nativeRoot, { withFileTypes: true })) {
  if (entry.name === "README.md" || entry.name.startsWith(".")) continue
  await cp(path.join(nativeRoot, entry.name), path.join(outputRoot, entry.name), {
    recursive: true,
    force: true,
  })
}

console.log("Native pages overlaid; Thoughts remains Quartz-powered at /blog/.")
