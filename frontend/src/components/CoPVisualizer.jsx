import { useEffect, useState } from "react";

const TRAIL_LENGTH = 40;
const W = 200;
const H = 200;
const CX = W / 2;
const CY = H / 2;
const PX_PER_MM = 7;

function toSvgX(ml) { return CX + ml * PX_PER_MM; }
function toSvgY(ap) { return CY - ap * PX_PER_MM; }

export function CoPVisualizer({ apSway, mlSway }) {
  const [trail, setTrail] = useState([]);

  useEffect(() => {
    if (apSway == null || mlSway == null) {
      setTrail([]);
      return;
    }
    setTrail((prev) => [...prev.slice(-(TRAIL_LENGTH - 1)), { ap: apSway, ml: mlSway }]);
  }, [apSway, mlSway]);

  const pathD = trail
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${toSvgX(pt.ml).toFixed(1)} ${toSvgY(pt.ap).toFixed(1)}`)
    .join(" ");
  const current = trail[trail.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Center of pressure sway path">
      <rect x="0" y="0" width={W} height={H} rx="10" fill="rgba(16,41,36,0.55)" />

      {/* Stability zone rings: danger (outer) → warning → stable (inner) */}
      <ellipse cx={CX} cy={CY} rx="78" ry="78" fill="#F94144" fillOpacity="0.07" stroke="#F94144" strokeOpacity="0.22" strokeWidth="1.5" />
      <ellipse cx={CX} cy={CY} rx="50" ry="50" fill="#F9C74F" fillOpacity="0.09" stroke="#F9C74F" strokeOpacity="0.28" strokeWidth="1.5" />
      <ellipse cx={CX} cy={CY} rx="24" ry="24" fill="#90BE6D" fillOpacity="0.14" stroke="#90BE6D" strokeOpacity="0.38" strokeWidth="1.5" />

      {/* Axes */}
      <line x1={CX} y1="6" x2={CX} y2={H - 6} stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeDasharray="3 4" />
      <line x1="6" y1={CY} x2={W - 6} y2={CY} stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeDasharray="3 4" />

      {/* Axis labels */}
      <text x={CX + 3} y="14" fill="rgba(255,255,255,0.62)" fontSize="9" fontWeight="700">AP</text>
      <text x={W - 7} y={CY - 4} textAnchor="end" fill="rgba(255,255,255,0.62)" fontSize="9" fontWeight="700">ML</text>

      {/* Sway trail */}
      {pathD ? (
        <path d={pathD} fill="none" stroke="#43AA8B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
      ) : null}

      {/* Trail dots with fade */}
      {trail.map((pt, i) => (
        <circle
          key={i}
          cx={toSvgX(pt.ml)}
          cy={toSvgY(pt.ap)}
          r="1.5"
          fill="#43AA8B"
          opacity={0.08 + 0.45 * (i / trail.length)}
        />
      ))}

      {/* Current position dot */}
      {current ? (
        <>
          <circle cx={toSvgX(current.ml)} cy={toSvgY(current.ap)} r="9" fill="#F94144" fillOpacity="0.18" />
          <circle cx={toSvgX(current.ml)} cy={toSvgY(current.ap)} r="5" fill="#F94144" stroke="#fff" strokeWidth="2" />
        </>
      ) : null}
    </svg>
  );
}
