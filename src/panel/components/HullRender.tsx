import type { CheckReportVerdict } from "../api.ts";

export interface HullRenderProps {
  verdict: CheckReportVerdict;
}

const VIEW_SIZE = 300;
const PADDING = 24;

const STATUS_STROKE: Record<CheckReportVerdict["status"], string> = {
  PASS: "#0f5132",
  FAIL: "#842029",
  UNKNOWN: "#664d03",
};
const STATUS_FILL: Record<CheckReportVerdict["status"], string> = {
  PASS: "#d1e7dd",
  FAIL: "#f8d7da",
  UNKNOWN: "#fff3cd",
};

/**
 * Self-contained inline SVG render of a perimeter verdict's measured hull
 * (GEOM-02, D-07) -- NO chart library, NO client-side geometry
 * recomputation. Renders only server-supplied numeric vertex arrays via JSX
 * interpolation; no `dangerouslySetInnerHTML` (T-03-05). Returns `null` when
 * `geometry` is absent (e.g. an UNKNOWN verdict has nothing to show).
 *
 * World floor-plane Y increases "up" in standard Cartesian convention, but
 * SVG's Y axis increases DOWNWARD -- rendering hull points directly as SVG
 * x,y would produce a vertically mirrored footprint (RESEARCH Pitfall 6).
 * The Y flip happens exactly once, at this component's SVG-mapping
 * boundary (`toSvg`), never upstream in server geometry math.
 */
export function HullRender({ verdict }: HullRenderProps) {
  const { geometry, measuredCount, limit, unit, status } = verdict;

  if (!geometry || geometry.hullVertices.length === 0) {
    return null;
  }

  const xs = geometry.hullVertices.map(([x]) => x);
  const ys = geometry.hullVertices.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const extentX = maxX - minX || 1;
  const extentY = maxY - minY || 1;
  const scale = (VIEW_SIZE - PADDING * 2) / Math.max(extentX, extentY);

  function toSvg([x, y]: [number, number]): [number, number] {
    const svgX = PADDING + (x - minX) * scale;
    // (maxY - y), not (y - minY): this both negates AND offsets Y in one
    // step, mapping the world's topmost (max-Y) point to the SVG's
    // smallest (top-of-viewBox) coordinate -- the y-flip documented above.
    const svgY = PADDING + (maxY - y) * scale;
    return [svgX, svgY];
  }

  const hullPoints = geometry.hullVertices.map((v) => toSvg(v).join(",")).join(" ");
  const stroke = STATUS_STROKE[status];
  const fill = STATUS_FILL[status];

  return (
    <svg
      width={VIEW_SIZE}
      height={VIEW_SIZE}
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      role="img"
      aria-label="Measured frame perimeter hull"
    >
      {geometry.framePartFootprints?.map((footprint, i) => (
        <polygon
          // eslint-disable-next-line react/no-array-index-key -- footprints
          // are an unordered, id-less server array; index is stable enough
          // for this render-only, non-reorderable list.
          key={`footprint-${i}`}
          points={footprint.map((v) => toSvg(v).join(",")).join(" ")}
          fill="none"
          stroke="#ccc"
          strokeDasharray="2,2"
        />
      ))}
      <polygon points={hullPoints} fill={fill} stroke={stroke} strokeWidth={2} />
      <text x={PADDING} y={VIEW_SIZE - 32} fontSize={12} fill={stroke}>
        {measuredCount !== undefined ? `${measuredCount.toFixed(1)} ${unit} measured` : ""}
      </text>
      <text x={PADDING} y={VIEW_SIZE - 14} fontSize={12}>
        {`limit: ${limit} ${unit}`}
      </text>
    </svg>
  );
}
