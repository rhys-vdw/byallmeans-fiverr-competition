import Handlebars from "handlebars"
import fs from "fs"
import path from "path"
import shell from "shelljs"
import { camelCase } from "lodash"
import Remarkable from "remarkable"
import constants from "./constants.json"
const { inlineSVG } = require("handlebars-helper-inlinesvg");
const md = new Remarkable()

const data = {
  ...constants,
  currentYear: new Date().getFullYear(),
}

const srcRoot = path.join(__dirname, "src")
const destRoot = path.join(__dirname, "build")

// Ensure build directories exist.
shell.rm("-rf", `${destRoot}/*`)
shell.mkdir("-p", `${destRoot}/static`)

// -- Helpers --

function srcPath(relativePath: string): string {
  return path.join(srcRoot, relativePath)
}

function stripExtensions(filePath: string): string {
  const name = path.parse(filePath).name
  const periodIndex = name.indexOf(".")
  return periodIndex == -1
    ? name
    : name.substr(0, periodIndex)
}

async function listFiles(lsPath: string): Promise<string[]> {
  const files = await fs.promises.readdir(lsPath)
  return files.map(file => path.join(lsPath, file))
}

async function registerPartials(path: string): Promise<void> {
  const partialPaths = await listFiles(srcPath(path))
  await Promise.all(partialPaths.map(async partialPath => {
    let partial = (await fs.promises.readFile(partialPath)).toString()
    const name = camelCase(stripExtensions(partialPath))
    if (partialPath.endsWith(".md")) {
      partial = md.render(partial)
    }
    console.log(`Registering "${path}/" partial "${name}"`)
    Handlebars.registerPartial(name, partial)
  }))
}

async function generatePages(): Promise<void> {
  const pagePaths = await listFiles(srcPath("pages"))
  await Promise.all(pagePaths.map(async pagePath => {
    const page = await fs.promises.readFile(pagePath)
    const template = Handlebars.compile(page.toString())
    const html = template(data)
    const destPath = path.join(destRoot, path.parse(pagePath).name)
    console.log(`Writing page "${destPath}"`)
    await fs.promises.writeFile(destPath, html)
  }))
}

const staticRoot = "./src/static"
async function copyStaticAssets(): Promise<void> {
  const staticFiles = await fs.promises.readdir(staticRoot)
  await Promise.all(staticFiles.map(async staticFile => {
    const srcPath = path.join(staticRoot, staticFile)
    const destPath = path.join(destRoot, 'static', path.basename(srcPath))
    console.log(`${srcPath} -> ${destPath}`)
    await fs.promises.copyFile(srcPath, destPath)
  }))
}

async function build() {
  Handlebars.registerHelper(
    'inlineSVG',
    (path: string, options: any) =>
      inlineSVG(`../../../src/static/svg/${path}`, options)
  )
  await registerPartials("partials")
  await generatePages()
  await copyStaticAssets()

  const cnameSource = path.join(__dirname, "CNAME");
  if (fs.existsSync(cnameSource)) {
    console.log("Copying CNAME")
    await fs.promises.copyFile(
      cnameSource,
      path.join(destRoot, "CNAME")
    )
  }

  console.log("Done!")
}

build()
