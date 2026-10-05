import { eachPixel, type Grid, type Palette } from "../sprites";

/** Sprite as absolutely positioned divs — satori-friendly. */
export function PixelArt({ grid, pal, px }: { grid: Grid; pal: Palette; px: number }) {
  const cells: JSX.Element[] = [];
  eachPixel(grid, pal, (x, y, c) => {
    cells.push(<div key={`${x}-${y}`} style={{ position: "absolute", left: x * px, top: y * px, width: px, height: px, background: c }} />);
  });
  return <div style={{ position: "relative", width: grid[0].length * px, height: grid.length * px, display: "flex" }}>{cells}</div>;
}
