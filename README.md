# Fontext (Font Extractor)
**`fontext`** is a `Node.js` library that allows you to extract font glyphs and convert them into various formats, including SVG, TTF, WOFF, WOFF2, and EOT. It provides an easy-to-use interface for converting font glyphs to different formats, making it suitable for use in web development projects and font manipulation tasks.

## Installation
To install fontext, use npm or yarn:

```bash
npm install fontext
```
or

```bash
yarn add fontext
```
## Usage
```javascript
import extract from 'fontext';

// Your font file as a Buffer
const fontBuffer = fs.readFileSync('path/to/your/font.ttf');

// Specify the extraction options
const options = {
    fontName: 'YourFontName', // Name of the output font
    formats: ['ttf', 'woff', 'woff2'], // Output formats you want to generate
    ligatures: ['fi', 'fl'], // Ligatures to include in the font
    withWhitespace: true, // Include whitespace glyphs in the font
};

// Extract and convert the font glyphs
extract(fontBuffer, options)
.then(result => {
// 'result' will be an object containing the extracted font data
// You can access the converted formats using 'result.ttf', 'result.woff', etc.
})
.catch(error => { console.error('Font extraction error:', error) });
```
## API
```
extract(content: Buffer, option: MinifyOption): Promise<ExtractedResult>
```
The main function that extracts font glyphs and converts them into different formats.

### Parameters
* **content** `Buffer`: The font file as a Buffer.
* **option** `MinifyOption`: An object containing extraction options.
  * **fontName** `string`: The desired name for the output font.
  * **formats** `Formats[]`: An array of output formats to generate. Valid values: 'svg', 'ttf', 'woff', 'woff2', 'eot'.
  * **ligatures** `string[]`: An array of ligatures to include in the font.
  * **withWhitespace** `boolean`: Set to true if you want to include whitespace glyphs in the font.
  
### Returns
* **Promise\<ExtractedResult\>**: A promise that resolves to an object containing the extracted font data, with keys corresponding to the specified output formats.
  
## License
  fontext is released under the MIT License. See the LICENSE file for details.

## Contributions
Contributions are welcome! If you find a bug or want to add a new feature, please open an issue or submit a pull request.

## Credits
fontext is built on top of various open-source libraries like fontkit, svg2ttf, ttf2woff, ttf2woff2, ttf2eot, SVGIcons2SVGFontStream, handlebars, and more. Thanks to all the developers and contributors of these projects.
