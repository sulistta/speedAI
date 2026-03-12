import { execFileSync } from 'node:child_process'
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

interface BrowserBundleManifest {
    bundleDirectory: string
    executableRelativePath: string
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const srcTauriDir = path.join(projectRoot, 'src-tauri')
const binariesDir = path.join(srcTauriDir, 'binaries')
const resourcesDir = path.join(srcTauriDir, 'resources')
const browserBundleDir = path.join(resourcesDir, 'web-agent-browser')
const browserManifestPath = path.join(
    resourcesDir,
    'web-agent-browser-manifest.json'
)
const sidecarSourcePath = path.join(
    projectRoot,
    'scripts',
    'web-agent-sidecar.ts'
)
const sidecarBaseName = 'web-agent-sidecar'

async function main() {
    const targetTriple = resolveRustTargetTriple()
    const sidecarOutputPath = await buildSidecarBinary(targetTriple)
    const browserManifest = await prepareBrowserBundle()

    console.log(
        `Prepared sidecar: ${path.relative(projectRoot, sidecarOutputPath)}`
    )
    console.log(
        `Prepared browser bundle: ${browserManifest.bundleDirectory}/${browserManifest.executableRelativePath}`
    )
}

function resolveRustTargetTriple() {
    const hostTuple = runRustc(['--print', 'host-tuple'])

    if (hostTuple.length > 0) {
        return hostTuple
    }

    const verboseVersion = runRustc(['-vV'])
    const match = verboseVersion.match(/^host:\s+(\S+)$/m)

    if (match?.[1]) {
        return match[1]
    }

    throw new Error('Nao foi possivel descobrir o target triple do Rust.')
}

function runRustc(args: string[]) {
    return execFileSync('rustc', args, {
        cwd: projectRoot,
        encoding: 'utf8'
    }).trim()
}

async function buildSidecarBinary(targetTriple: string) {
    await mkdir(binariesDir, { recursive: true })

    const extension = process.platform === 'win32' ? '.exe' : ''
    const outputPath = path.join(
        binariesDir,
        `${sidecarBaseName}-${targetTriple}${extension}`
    )

    const compileResult = Bun.spawnSync({
        cmd: [
            process.execPath,
            'build',
            sidecarSourcePath,
            '--compile',
            '--external',
            'electron',
            '--external',
            'chromium-bidi',
            '--external',
            'chromium-bidi/*',
            '--outfile',
            outputPath
        ],
        cwd: projectRoot,
        stdout: 'inherit',
        stderr: 'inherit'
    })

    if (compileResult.exitCode !== 0) {
        throw new Error('Falha ao compilar o sidecar web para binario.')
    }

    return outputPath
}

async function prepareBrowserBundle() {
    const browserExecutablePath = await resolveBrowserExecutablePath()
    const browserBundleRoot = resolveBrowserBundleRoot(browserExecutablePath)
    const bundleDirectory = path.basename(browserBundleRoot)
    const executableRelativePath = toPortablePath(
        path.relative(browserBundleRoot, browserExecutablePath)
    )

    await mkdir(resourcesDir, { recursive: true })
    await rm(browserBundleDir, { recursive: true, force: true })
    await mkdir(browserBundleDir, { recursive: true })

    const destinationBundlePath = path.join(browserBundleDir, bundleDirectory)

    await cp(browserBundleRoot, destinationBundlePath, { recursive: true })

    const manifest: BrowserBundleManifest = {
        bundleDirectory,
        executableRelativePath
    }

    await writeFile(
        browserManifestPath,
        `${JSON.stringify(manifest, null, 4)}\n`
    )

    return manifest
}

async function resolveBrowserExecutablePath() {
    const configuredPath =
        process.env.SPEEDAI_BROWSER_BUILD_EXECUTABLE_PATH?.trim()

    if (configuredPath) {
        await ensurePathExists(
            configuredPath,
            'O executavel configurado em SPEEDAI_BROWSER_BUILD_EXECUTABLE_PATH nao existe.'
        )
        return configuredPath
    }

    const executablePath = chromium.executablePath()

    if (!executablePath) {
        throw new Error(
            'O Playwright nao retornou um executavel Chromium. Rode "bunx playwright install chromium" na maquina de build.'
        )
    }

    await ensurePathExists(
        executablePath,
        'O Chromium do Playwright nao foi encontrado. Rode "bunx playwright install chromium" na maquina de build.'
    )

    return executablePath
}

async function ensurePathExists(targetPath: string, errorMessage: string) {
    try {
        await stat(targetPath)
    } catch {
        throw new Error(errorMessage)
    }
}

function resolveBrowserBundleRoot(browserExecutablePath: string) {
    const knownBundleRoots = new Set([
        'chrome-linux',
        'chrome-linux64',
        'chrome-win',
        'chrome-win64',
        'chrome-mac',
        'chrome-mac-arm64'
    ])

    let currentPath = path.dirname(browserExecutablePath)

    while (true) {
        const currentName = path.basename(currentPath)

        if (knownBundleRoots.has(currentName)) {
            return currentPath
        }

        const parentPath = path.dirname(currentPath)

        if (parentPath === currentPath) {
            return path.dirname(browserExecutablePath)
        }

        currentPath = parentPath
    }
}

function toPortablePath(filePath: string) {
    return filePath.split(path.sep).join('/')
}

await main()
