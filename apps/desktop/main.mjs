import { createServer } from "node:http"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { app, BrowserWindow, dialog, shell } from "electron"
import httpProxy from "http-proxy"
import sirv from "sirv"

const desktopRoot = path.dirname(fileURLToPath(import.meta.url))
const loopbackHost = "127.0.0.1"
let mainWindow
let applicationServer

function normalizeAPIOrigin(value) {
  const parsed = new URL(String(value || "http://127.0.0.1:8080").trim())
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    throw new Error("apiOrigin must be an HTTP(S) origin without credentials or a path")
  }
  return parsed.origin
}

function normalizeDesktopPort(value) {
  const port = Number(value || 41731)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("localPort must be an integer between 1024 and 65535")
  return port
}

function readDesktopConfiguration() {
  const candidates = [
    process.env.NOVA_DESKTOP_CONFIG,
    path.join(path.dirname(process.execPath), "nova-desktop.json"),
    app.isPackaged ? path.join(process.resourcesPath, "desktop.config.json") : path.join(desktopRoot, ".build", "desktop.config.json"),
  ].filter(Boolean)

  let configuration = {}
  for (const candidate of candidates) {
    try {
      configuration = JSON.parse(readFileSync(candidate, "utf8"))
      break
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
  }
  return {
    apiOrigin: normalizeAPIOrigin(process.env.NOVA_DESKTOP_API_ORIGIN || configuration.apiOrigin),
    localPort: normalizeDesktopPort(process.env.NOVA_DESKTOP_PORT || configuration.localPort),
  }
}

function startApplicationServer(apiOrigin, localPort) {
  const webRoot = process.env.NOVA_DESKTOP_WEB_ROOT
    ? path.resolve(process.env.NOVA_DESKTOP_WEB_ROOT)
    : app.isPackaged
      ? path.join(process.resourcesPath, "web")
      : path.resolve(desktopRoot, "..", "web", "dist")
  const serveWeb = sirv(webRoot, { etag: true, single: true })
  const proxy = httpProxy.createProxyServer({ target: apiOrigin, changeOrigin: true, secure: true, xfwd: true })

  proxy.on("error", (_error, _request, response) => {
    if (response.headersSent) return response.end()
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" })
    response.end(JSON.stringify({ code: 50201, data: null, msg: "无法连接服务，请检查网络或稍后重试" }))
  })

  applicationServer = createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://desktop.local").pathname
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      proxy.web(request, response)
      return
    }
    response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:")
    response.setHeader("Referrer-Policy", "no-referrer")
    response.setHeader("X-Content-Type-Options", "nosniff")
    serveWeb(request, response, () => {
      response.writeHead(404)
      response.end("Not found")
    })
  })

  return new Promise((resolve, reject) => {
    applicationServer.once("error", reject)
    applicationServer.listen(localPort, loopbackHost, () => resolve(`http://${loopbackHost}:${localPort}`))
  })
}

async function createMainWindow(applicationURL) {
  const smokeTest = process.env.NOVA_DESKTOP_SMOKE_TEST === "1"
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f7f8fa",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (smokeTest) {
    mainWindow.webContents.once("did-finish-load", async () => {
      const result = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
        const read = () => {
          const mounted = Boolean(document.querySelector('#app')?.children.length)
          if (mounted) resolve({ title: document.title, route: location.pathname, origin: location.origin, mounted })
          return mounted
        }
        if (read()) return
        const observer = new MutationObserver(() => {
          if (read()) observer.disconnect()
        })
        observer.observe(document.documentElement, { childList: true, subtree: true })
      })`)
      const serialized = JSON.stringify(result)
      if (process.env.NOVA_DESKTOP_SMOKE_RESULT) writeFileSync(process.env.NOVA_DESKTOP_SMOKE_RESULT, `${serialized}\n`, "utf8")
      console.log(serialized)
      app.quit()
    })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) void shell.openExternal(url)
    return { action: "deny" }
  })
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(applicationURL)) return
    event.preventDefault()
    if (url.startsWith("http://") || url.startsWith("https://")) void shell.openExternal(url)
  })
  if (!smokeTest) mainWindow.once("ready-to-show", () => mainWindow?.show())
  await mainWindow.loadURL(applicationURL)
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.setAppUserModelId("com.novastudio.creator")
  app.on("second-instance", () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(async () => {
    const configuration = readDesktopConfiguration()
    const applicationURL = await startApplicationServer(configuration.apiOrigin, configuration.localPort)
    await createMainWindow(applicationURL)
  }).catch((error) => {
    console.error(error)
    dialog.showErrorBox("Nova Studio 启动失败", error?.code === "EADDRINUSE" ? "客户端本地端口已被占用，请关闭其他 Nova Studio 进程后重试。" : String(error?.message || error))
    app.quit()
  })
}

app.on("window-all-closed", () => app.quit())
app.on("before-quit", () => applicationServer?.close())
