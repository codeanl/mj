import { mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const scriptRoot = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptRoot, "..")
const sourcePath = path.resolve(desktopRoot, "..", "web", "public", "favicon.svg")
const outputPath = path.join(desktopRoot, "build", "icon.png")

mkdirSync(path.dirname(outputPath), { recursive: true })
await sharp(sourcePath).resize(512, 512).png().toFile(outputPath)
