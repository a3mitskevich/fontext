import { GlyphRun } from "fontkit";

export {}

declare module "fontkit" {
    export interface Glyph {
        _metrics: GlyphRun
    }
}
