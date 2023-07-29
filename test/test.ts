import extract from '../src'
import fs from 'fs'
import path from 'path'
import { type Formats } from '../src/types'

const resolve = (format: Formats): string => path.resolve(__dirname, `../assets/font.${format}`)

const ttfOriginalFont = fs.readFileSync(resolve('ttf'))
const woff2OriginalFont = fs.readFileSync(resolve('woff2'))

describe('extract', () => {
  it('should transform ttf', async () => {
    const { ttf, woff2 } = await extract(
      ttfOriginalFont,
      { fontName: 'test-icons', ligatures: ['abc'], formats: ['woff2', 'ttf'] }
    )
    expect(ttf).toBeInstanceOf(Buffer)
    expect(woff2).toBeInstanceOf(Buffer)
    expect(ttf.length < ttfOriginalFont.length).toBeTruthy()
    expect(woff2.length < woff2OriginalFont.length).toBeTruthy()
  })

  it('should transform woff2', async () => {
    const { ttf, woff2 } = await extract(
      woff2OriginalFont,
      { fontName: 'test-icons', ligatures: ['abc'], formats: ['woff2', 'ttf'] }
    )
    expect(ttf).toBeInstanceOf(Buffer)
    expect(woff2).toBeInstanceOf(Buffer)
    expect(ttf.length < ttfOriginalFont.length).toBeTruthy()
    expect(woff2.length < woff2OriginalFont.length).toBeTruthy()
  })
})
