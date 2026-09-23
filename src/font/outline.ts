/** A drawing command as harfbuzzjs reports it: M, L, Q, C or Z with absolute coordinates. */
export interface PathCommand {
  type: string;
  values: number[];
}

const round = (value: number): number => Math.round(value * 100) / 100;

const returnsToStart = (command: PathCommand, start: number[]): boolean =>
  command.type === "L" && command.values[0] === start[0] && command.values[1] === start[1];

/**
 * SVG path data of a glyph outline, flipped to the SVG y-down axis and rounded to 0.01.
 * HarfBuzz closes each contour with a line back to its start; `Z` already does that, so the
 * line is dropped.
 */
export function toSvgPath(commands: readonly PathCommand[]): string {
  let start: number[] = [];
  return commands
    .filter((command, index) => {
      if (command.type === "M") {
        start = command.values;
      }
      return !(commands[index + 1]?.type === "Z" && returnsToStart(command, start));
    })
    .map(
      ({ type, values }) =>
        type + values.map((value, index) => round(index % 2 === 1 ? -value : value)).join(" "),
    )
    .join("");
}
