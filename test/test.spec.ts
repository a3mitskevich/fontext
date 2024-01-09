import fs from 'fs'
import path from 'path'
import type { Format, Extract } from '../src'
import { createCachedImport } from './utils'
const importTargets = {
  local: createCachedImport(async () => import('../src')),
  dist: createCachedImport(async () => import('../dist')),
}
const resolve = (format: Format): string => path.resolve(__dirname, `../assets/font.${format}`)

const ttfOriginalFont = fs.readFileSync(resolve('ttf'))
const woff2OriginalFont = fs.readFileSync(resolve('woff2'))
const ABC_SVG_PATH = 'd="M448 -277L416 -277L416 -288L373 -288L373 -224L416 -224L416 -235L448 -235L448 -213Q448 -205 441.5 -198.5Q435 -192 427 -192L363 -192Q354 -192 347.5 -198.5Q341 -205 341 -213L341 -299Q341 -307 347.5 -313.5Q354 -320 363 -320L427 -320Q435 -320 441.5 -313.5Q448 -307 448 -299ZM171 -299L171 -192L139 -192L139 -224L96 -224L96 -192L64 -192L64 -299Q64 -307 70.5 -313.5Q77 -320 85 -320L149 -320Q158 -320 164.5 -313.5Q171 -307 171 -299ZM139 -288L96 -288L96 -256L139 -256ZM288 -256Q297 -256 303 -249.5Q309 -243 309 -235L309 -213Q309 -205 303 -198.5Q297 -192 288 -192L203 -192L203 -320L288 -320Q297 -320 303 -313.5Q309 -307 309 -299L309 -277Q309 -269 303 -262.5Q297 -256 288 -256ZM235 -288L235 -272L277 -272L277 -288ZM277 -240L235 -240L235 -224L277 -224Z"'

const extract: Extract = async (...args: any[]): Promise<any> => {
  const testTarget = process.env.TEST_TARGET as keyof typeof importTargets
  const { default: index } = await importTargets[testTarget]()
  return index.default.apply(null, args)
}

describe('extract', () => {
  it('should transform ttf', async () => {
    const { ttf, woff2 } = await extract(
      ttfOriginalFont,
      { fontName: 'test-icons', ligatures: ['abc'], formats: ['woff2', 'ttf'] },
    )
    expect(ttf).toBeInstanceOf(Buffer)
    expect(woff2).toBeInstanceOf(Buffer)
    expect(ttf.length < ttfOriginalFont.length).toBeTruthy()
    expect(woff2.length < woff2OriginalFont.length).toBeTruthy()
  })

  it('should transform woff2', async () => {
    const { ttf, woff2 } = await extract(
      woff2OriginalFont,
      { fontName: 'test-icons', ligatures: ['abc'], formats: ['woff2', 'ttf'] },
    )
    expect(ttf).toBeInstanceOf(Buffer)
    expect(woff2).toBeInstanceOf(Buffer)
    expect(ttf.length < ttfOriginalFont.length).toBeTruthy()
    expect(woff2.length < woff2OriginalFont.length).toBeTruthy()
  })

  it('should return meta info', async () => {
    const { meta } = await extract(
      woff2OriginalFont,
      { fontName: 'test-icons', ligatures: ['abc'], formats: ['woff2'] },
    )
    expect(meta).toHaveLength(1)
    const [glyphMeta] = meta
    expect(glyphMeta.name).toEqual('abc')
    expect(glyphMeta.unicode).toEqual([''])
    expect(glyphMeta.svg.includes(ABC_SVG_PATH)).toBeTruthy()
  })
})
