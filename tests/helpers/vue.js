import { build } from 'esbuild'
import { parse, compileScript } from '@vue/compiler-sfc'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function component(file) {
  const target = resolve('tests/.cache', file.replace(/[^a-z0-9]/gi, '_') + '.mjs')
  await mkdir(resolve('tests/.cache'), { recursive: true })
  await build({
    entryPoints: [resolve(file)], outfile: target, bundle: true, format: 'esm', platform: 'node',
    packages: 'external',
    plugins: [{ name: 'vue-test', setup(builder) {
      builder.onLoad({ filter: /\.vue$/ }, async ({ path }) => {
        const { descriptor } = parse(await readFile(path, 'utf8'))
        const compiled = compileScript(descriptor, { id: path, inlineTemplate: true })
        return { contents: compiled.content, loader: 'js' }
      })
    } }],
  })
  return (await import(pathToFileURL(target).href)).default
}
