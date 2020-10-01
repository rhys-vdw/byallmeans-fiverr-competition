import Handlebars, { compile } from "handlebars"
import fs from "fs"
import path from "path"
import shell from "shelljs"
import { camelCase } from "lodash"
import Remarkable from "remarkable"
import sass from "node-sass"
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

async function compileSass() {
  const sassPath = srcPath("sass");
  const files = await fs.promises.readdir(sassPath)
  await Promise.all(files.map(async file => {
    if (file.startsWith("_")) {
      return null;
    }
    const ext = path.extname(file);
    if (![".sass", ".scss"].includes(ext)) {
      return null;
    }
    const result = await new Promise<sass.Result>((resolve, reject) => {
      sass.render({
        file: path.join(sassPath, file),
        omitSourceMapUrl: true
      }, (error, result) => {
        if (error != null) reject(error)
        else resolve(result)
      });
    })
    const destPath = path.join(destRoot, 'static', `${path.parse(file).name}.css`)
    console.log(`Compiled SASS "${file}" to "${destPath}"`)
    await fs.promises.writeFile(destPath, result.css)
  }));
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
  await shell.cp("-r", staticRoot, destRoot)
}

async function build() {
  Handlebars.registerHelper(
    'inlineSVG',
    (path: string, options: any) =>
      inlineSVG(`../../../src/svg/${path}`, options)
  )
  Handlebars.registerHelper(
    'default',
    (value: any, defaultValue: any) => value == null ? defaultValue : value
  )
  await registerPartials("partials")
  await generatePages()
  await copyStaticAssets()
  await compileSass()

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
