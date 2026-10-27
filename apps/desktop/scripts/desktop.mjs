import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import electronPath from "electron"

const scriptRoot = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptRoot, "..")
const projectRoot = path.resolve(desktopRoot, "..", "..")
const command = process.argv[2]

function readOption(name) {
  const prefix = `${name}=`
  const inline = process.argv.find((value) => value.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function normalizeAPIOrigin(value) {
  const parsed = new URL(String(value || "http://127.0.0.1:8080").trim())
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    throw new Error("--api-origin 必须是没有账号、密码和路径的 HTTP(S) 地址，例如 https://api.example.com")
  }
  return parsed.origin
}

function runPnpm(arguments_) {
  const pnpmEntry = process.env.npm_execpath
  if (!pnpmEntry) throw new Error("请使用 pnpm 运行桌面端命令")
  const result = spawnSync(process.execPath, [pnpmEntry, ...arguments_], { cwd: projectRoot, env: process.env, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

function buildWeb() {
  runPnpm(["--filter", "@nova/web", "build"])
}

const apiOrigin = normalizeAPIOrigin(readOption("--api-origin") || process.env.NOVA_DESKTOP_API_ORIGIN)
buildWeb()

if (command === "dev") {
  const child = spawn(electronPath, [desktopRoot], {
    cwd: desktopRoot,
    env: { ...process.env, NOVA_DESKTOP_API_ORIGIN: apiOrigin, NOVA_DESKTOP_WEB_ROOT: path.join(projectRoot, "apps", "web", "dist") },
    stdio: "inherit",
  })
  child.on("exit", (code) => process.exit(code || 0))
} else if (command === "package") {
  const buildRoot = path.join(desktopRoot, ".build")
  mkdirSync(buildRoot, { recursive: true })
  writeFileSync(path.join(buildRoot, "desktop.config.json"), `${JSON.stringify({ apiOrigin }, null, 2)}\n`, "utf8")
  runPnpm(["--filter", "@nova/desktop", "icon:generate"])
  runPnpm(["--filter", "@nova/desktop", "exec", "electron-builder", "--win"])
} else {
  throw new Error(`未知桌面端命令：${command || "<empty>"}`)
}
