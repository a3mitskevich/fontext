/**
 * Unicode Script of code points, through the `\p{Script=…}` classes of the JavaScript engine.
 * JavaScript can't list the Script values it knows, so they are listed here: every script of
 * Unicode 17. A script the engine doesn't know yet is left out; its code points are unassigned
 * there and so Script=Unknown.
 */
const SCRIPT_VALUES = [
  "Adlam",
  "Ahom",
  "Anatolian_Hieroglyphs",
  "Arabic",
  "Armenian",
  "Avestan",
  "Balinese",
  "Bamum",
  "Bassa_Vah",
  "Batak",
  "Bengali",
  "Beria_Erfe",
  "Bhaiksuki",
  "Bopomofo",
  "Brahmi",
  "Braille",
  "Buginese",
  "Buhid",
  "Canadian_Aboriginal",
  "Carian",
  "Caucasian_Albanian",
  "Chakma",
  "Cham",
  "Cherokee",
  "Chisoi",
  "Chorasmian",
  "Coptic",
  "Cuneiform",
  "Cypriot",
  "Cypro_Minoan",
  "Cyrillic",
  "Deseret",
  "Devanagari",
  "Dives_Akuru",
  "Dogra",
  "Duployan",
  "Egyptian_Hieroglyphs",
  "Elbasan",
  "Elymaic",
  "Ethiopic",
  "Garay",
  "Georgian",
  "Glagolitic",
  "Gothic",
  "Grantha",
  "Greek",
  "Gujarati",
  "Gunjala_Gondi",
  "Gurmukhi",
  "Gurung_Khema",
  "Han",
  "Hangul",
  "Hanifi_Rohingya",
  "Hanunoo",
  "Hatran",
  "Hebrew",
  "Hiragana",
  "Imperial_Aramaic",
  "Inscriptional_Pahlavi",
  "Inscriptional_Parthian",
  "Javanese",
  "Kaithi",
  "Kannada",
  "Katakana",
  "Kawi",
  "Kayah_Li",
  "Kharoshthi",
  "Khitan_Small_Script",
  "Khmer",
  "Khojki",
  "Khudawadi",
  "Kirat_Rai",
  "Lao",
  "Latin",
  "Lepcha",
  "Limbu",
  "Linear_A",
  "Linear_B",
  "Lisu",
  "Lycian",
  "Lydian",
  "Mahajani",
  "Makasar",
  "Malayalam",
  "Mandaic",
  "Manichaean",
  "Marchen",
  "Masaram_Gondi",
  "Medefaidrin",
  "Meetei_Mayek",
  "Mende_Kikakui",
  "Meroitic_Cursive",
  "Meroitic_Hieroglyphs",
  "Miao",
  "Modi",
  "Mongolian",
  "Mro",
  "Multani",
  "Myanmar",
  "Nabataean",
  "Nag_Mundari",
  "Nandinagari",
  "New_Tai_Lue",
  "Newa",
  "Nko",
  "Nushu",
  "Nyiakeng_Puachue_Hmong",
  "Ogham",
  "Ol_Chiki",
  "Ol_Onal",
  "Old_Hungarian",
  "Old_Italic",
  "Old_North_Arabian",
  "Old_Permic",
  "Old_Persian",
  "Old_Sogdian",
  "Old_South_Arabian",
  "Old_Turkic",
  "Old_Uyghur",
  "Oriya",
  "Osage",
  "Osmanya",
  "Pahawh_Hmong",
  "Palmyrene",
  "Pau_Cin_Hau",
  "Phags_Pa",
  "Phoenician",
  "Psalter_Pahlavi",
  "Rejang",
  "Runic",
  "Samaritan",
  "Saurashtra",
  "Sharada",
  "Shavian",
  "Siddham",
  "Sidetic",
  "SignWriting",
  "Sinhala",
  "Sogdian",
  "Sora_Sompeng",
  "Soyombo",
  "Sundanese",
  "Sunuwar",
  "Syloti_Nagri",
  "Syriac",
  "Tagalog",
  "Tagbanwa",
  "Tai_Le",
  "Tai_Tham",
  "Tai_Viet",
  "Tai_Yo",
  "Takri",
  "Tamil",
  "Tangsa",
  "Tangut",
  "Telugu",
  "Thaana",
  "Thai",
  "Tibetan",
  "Tifinagh",
  "Tirhuta",
  "Todhri",
  "Tolong_Siki",
  "Toto",
  "Tulu_Tigalari",
  "Ugaritic",
  "Vai",
  "Vithkuqi",
  "Wancho",
  "Warang_Citi",
  "Yezidi",
  "Yi",
  "Zanabazar_Square",
] as const;

/**
 * Code points every script uses: Script=Common (digits, punctuation, space) and Script=Inherited
 * (combining marks, which take the script of the letter they follow).
 */
export const COMMON_SCRIPT = "common";
/** Code points of no script: unassigned, private use, surrogates and noncharacters. */
export const UNKNOWN_SCRIPT = "unknown";

interface ScriptClass {
  /** The Script value in lowercase, e.g. "latin", "old_italic"; Inherited is "common". */
  readonly name: string;
  readonly pattern: RegExp;
}

/** The class of a Script value, or undefined when the engine doesn't know the value. */
function scriptClass(value: string, name = value.toLowerCase()): ScriptClass | undefined {
  try {
    return { name, pattern: new RegExp(`^\\p{Script=${value}}$`, "u") };
  } catch {
    // A script newer than the engine's Unicode: its code points are Script=Unknown there
    return undefined;
  }
}

const SCRIPT_CLASSES: readonly ScriptClass[] = [
  ...["Common", "Inherited"].map((value) => scriptClass(value, COMMON_SCRIPT)),
  ...SCRIPT_VALUES.map((value) => scriptClass(value)),
  /*
   * Last, since it is tried only after every script; a run of unassigned code points still costs
   * one test per code point
   */
  scriptClass("Unknown", UNKNOWN_SCRIPT),
].filter((entry) => entry !== undefined);

const matchingClass = (char: string, from: readonly ScriptClass[]): ScriptClass | undefined =>
  from.find(({ pattern }) => pattern.test(char));

/**
 * The script of each code point: a lowercase Script value, "common" for Common and Inherited,
 * "unknown" for code points of no script. Code points of one script mostly come in runs, so the
 * script of the previous code point is tried first: a run costs one test per code point.
 */
export function scriptsOf(codePoints: readonly number[]): string[] {
  let previous: ScriptClass | undefined;
  return codePoints.map((codePoint) => {
    const char = String.fromCodePoint(codePoint);
    const found =
      previous && previous.pattern.test(char) ? previous : matchingClass(char, SCRIPT_CLASSES);
    previous = found ?? previous;
    return found?.name ?? UNKNOWN_SCRIPT;
  });
}

/** Code points grouped by script, each group ascending, in the order of their first code point. */
export function groupByScript(codePoints: readonly number[]): Map<string, number[]> {
  const sorted = [...new Set(codePoints)].toSorted((a, b) => a - b);
  const scripts = scriptsOf(sorted);
  const groups = new Map<string, number[]>();
  // Pushed into arrays of this function: a copy per code point would be quadratic for CJK fonts
  sorted.forEach((codePoint, index) => {
    const group = groups.get(scripts[index]);
    if (group) {
      group.push(codePoint);
    } else {
      groups.set(scripts[index], [codePoint]);
    }
  });
  return groups;
}

const HEX_DIGITS = 4;
const hex = (codePoint: number): string =>
  codePoint.toString(16).toUpperCase().padStart(HEX_DIGITS, "0");

/** Runs of consecutive code points as [first, last] pairs, ascending. */
function runsOf(codePoints: readonly number[]): [number, number][] {
  const sorted = [...new Set(codePoints)].toSorted((a, b) => a - b);
  const starts = sorted.filter(
    (codePoint, index) => index === 0 || sorted[index - 1] !== codePoint - 1,
  );
  const ends = sorted.filter(
    (codePoint, index) => index === sorted.length - 1 || sorted[index + 1] !== codePoint + 1,
  );
  return starts.map((start, index) => [start, ends[index]]);
}

/** The code points in CSS `unicode-range` syntax, runs merged: "U+0020,U+0041-005A". */
export function toUnicodeRange(codePoints: readonly number[]): string {
  return runsOf(codePoints)
    .map(([first, last]) => (first === last ? `U+${hex(first)}` : `U+${hex(first)}-${hex(last)}`))
    .join(",");
}
