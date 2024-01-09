import extract from './extract'

export { type Formats, type MinifyOption, type ExtractedResult, type Formats as Format } from './types'
export type Extract = typeof extract

export { extract }
export default extract
