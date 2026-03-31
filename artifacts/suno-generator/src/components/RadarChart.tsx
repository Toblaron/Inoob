import { useState } from "react";
import { cn } from "@/lib/utils";

export interface RadarAxis {
  key: string;
  label: string;
  value: number;
  tooltip: string;
}

interface RadarChartProps {
  axes: RadarAxis[];
  color?: string;
  fillColor?: string;
  size?: number;
  className?: string;
  showLabels?: boolean;
  showTooltips?: boolean;
  opacity?: number;
}

const DEFAULT_SIZE = 260;
const INNER_PADDING = 48;

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleRad: number
): [number, number] {
  return [cx + r * Math.cos(angleRad), cy + r * Math.sin(angleRad)];
}

export function RadarChart({
  axes,
  color = "hsl(188 100% 50%)",
  fillColor,
  size = DEFAULT_SIZE,
  className,
  showLabels = true,
  showTooltips = true,
  opacity = 1,
}: RadarChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const n = axes.length;
  if (n < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - INNER_PADDING;
  const startAngle = -Math.PI / 2;

  const angleStep = (2 * Math.PI) / n;
  const getAngle = (i: number) => startAngle + i * angleStep;

  const gridLevels = [2, 4, 6, 8, 10];

  const dataPolygon = axes.map((axis, i) => {
    const r = (axis.value / 10) * maxR;
    return polarToCartesian(cx, cy, r, getAngle(i));
  });

  const axisEndpoints = axes.map((_, i) => polarToCartesian(cx, cy, maxR, getAngle(i)));

  const effectiveFill = fillColor ?? color;

  const labelPositions = axes.map((axis, i) => {
    const angle = getAngle(i);
    const labelR = maxR + 30;
    const [lx, ly] = polarToCartesian(cx, cy, labelR, angle);

    let anchor: "start" | "middle" | "end" = "middle";
    const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (normalizedAngle > Math.PI * 0.1 && normalizedAngle < Math.PI * 0.9) anchor = "start";
    else if (normalizedAngle > Math.PI * 1.1 && normalizedAngle < Math.PI * 1.9) anchor = "end";

    return { lx, ly, anchor, axis };
  });

  return (
    <div className={cn("relative select-none", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid rings */}
        {gridLevels.map((level) => {
          const r = (level / 10) * maxR;
          const pts = Array.from({ length: n }, (_, i) =>
            polarToCartesian(cx, cy, r, getAngle(i))
          );
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ") + " Z";
          return (
            <path
              key={level}
              d={d}
              fill="none"
              stroke="hsl(188 100% 50% / 0.12)"
              strokeWidth={level === 10 ? 1 : 0.5}
            />
          );
        })}

        {/* Axis spokes */}
        {axisEndpoints.map(([ax, ay], i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={ax.toFixed(2)}
            y2={ay.toFixed(2)}
            stroke="hsl(188 100% 50% / 0.15)"
            strokeWidth={0.75}
          />
        ))}

        {/* Data polygon */}
        <polygon
          points={dataPolygon.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(" ")}
          fill={effectiveFill}
          fillOpacity={0.18 * opacity}
          stroke={color}
          strokeWidth={2}
          strokeOpacity={opacity}
        />

        {/* Data points */}
        {dataPolygon.map(([px, py], i) => {
          const axis = axes[i];
          const isHovered = hovered === axis.key;
          return (
            <circle
              key={axis.key}
              cx={px.toFixed(2)}
              cy={py.toFixed(2)}
              r={isHovered ? 5 : 3.5}
              fill={color}
              fillOpacity={opacity}
              stroke="hsl(0 0% 2%)"
              strokeWidth={1.5}
              style={{ cursor: showTooltips ? "pointer" : "default", transition: "r 0.15s" }}
              onMouseEnter={() => showTooltips && setHovered(axis.key)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}

        {/* Labels */}
        {showLabels && labelPositions.map(({ lx, ly, anchor, axis }) => {
          const isHovered = hovered === axis.key;
          return (
            <text
              key={axis.key}
              x={lx.toFixed(2)}
              y={ly.toFixed(2)}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={9}
              fontFamily="'JetBrains Mono', monospace"
              fill={isHovered ? color : "hsl(0 0% 65%)"}
              style={{ transition: "fill 0.15s", cursor: showTooltips ? "pointer" : "default" }}
              onMouseEnter={() => showTooltips && setHovered(axis.key)}
              onMouseLeave={() => setHovered(null)}
            >
              {axis.label}
            </text>
          );
        })}

        {/* Value label on hover */}
        {hovered && (() => {
          const axis = axes.find((a) => a.key === hovered);
          if (!axis) return null;
          return (
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={15}
              fontFamily="'JetBrains Mono', monospace"
              fill={color}
              fontWeight="bold"
            >
              {axis.value.toFixed(1)}
            </text>
          );
        })()}
      </svg>

      {/* Hover tooltip */}
      {showTooltips && hovered && (() => {
        const axis = axes.find((a) => a.key === hovered);
        if (!axis) return null;
        return (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full mt-1 z-20 pointer-events-none">
            <div className="bg-zinc-900 border border-primary/30 px-3 py-1.5 text-[10px] font-mono text-zinc-300 max-w-[220px] text-center whitespace-nowrap shadow-lg">
              <span className="text-primary font-bold">{axis.label}: {axis.value.toFixed(1)}/10</span>
              <span className="block text-zinc-500 mt-0.5 whitespace-normal text-left">{axis.tooltip}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export function DoubleRadarChart({
  axesA,
  axesB,
  labelA,
  labelB,
  size = DEFAULT_SIZE,
  className,
}: {
  axesA: RadarAxis[];
  axesB: RadarAxis[];
  labelA: string;
  labelB: string;
  size?: number;
  className?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const n = axesA.length;
  if (n < 3 || axesB.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - INNER_PADDING;
  const startAngle = -Math.PI / 2;
  const angleStep = (2 * Math.PI) / n;
  const getAngle = (i: number) => startAngle + i * angleStep;

  const gridLevels = [2, 4, 6, 8, 10];

  const polyA = axesA.map((axis, i) => {
    const r = (axis.value / 10) * maxR;
    return polarToCartesian(cx, cy, r, getAngle(i));
  });

  const polyB = axesB.map((axis, i) => {
    const r = (axis.value / 10) * maxR;
    return polarToCartesian(cx, cy, r, getAngle(i));
  });

  const axisEndpoints = axesA.map((_, i) => polarToCartesian(cx, cy, maxR, getAngle(i)));

  const labelPositions = axesA.map((axis, i) => {
    const angle = getAngle(i);
    const labelR = maxR + 30;
    const [lx, ly] = polarToCartesian(cx, cy, labelR, angle);
    let anchor: "start" | "middle" | "end" = "middle";
    const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (normalizedAngle > Math.PI * 0.1 && normalizedAngle < Math.PI * 0.9) anchor = "start";
    else if (normalizedAngle > Math.PI * 1.1 && normalizedAngle < Math.PI * 1.9) anchor = "end";
    return { lx, ly, anchor, axis };
  });

  return (
    <div className={cn("relative select-none", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {gridLevels.map((level) => {
          const r = (level / 10) * maxR;
          const pts = Array.from({ length: n }, (_, i) => polarToCartesian(cx, cy, r, getAngle(i)));
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ") + " Z";
          return (
            <path key={level} d={d} fill="none" stroke="hsl(188 100% 50% / 0.12)" strokeWidth={level === 10 ? 1 : 0.5} />
          );
        })}

        {axisEndpoints.map(([ax, ay], i) => (
          <line key={i} x1={cx} y1={cy} x2={ax.toFixed(2)} y2={ay.toFixed(2)} stroke="hsl(188 100% 50% / 0.15)" strokeWidth={0.75} />
        ))}

        <polygon
          points={polyA.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(" ")}
          fill="hsl(188 100% 50%)"
          fillOpacity={0.12}
          stroke="hsl(188 100% 50%)"
          strokeWidth={2}
        />

        <polygon
          points={polyB.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(" ")}
          fill="hsl(300 100% 70%)"
          fillOpacity={0.12}
          stroke="hsl(300 100% 70%)"
          strokeWidth={2}
        />

        {polyA.map(([px, py], i) => (
          <circle key={`a-${i}`} cx={px.toFixed(2)} cy={py.toFixed(2)} r={3} fill="hsl(188 100% 50%)" stroke="hsl(0 0% 2%)" strokeWidth={1.5}
            onMouseEnter={() => setHovered(`a-${axesA[i].key}`)}
            onMouseLeave={() => setHovered(null)} />
        ))}
        {polyB.map(([px, py], i) => (
          <circle key={`b-${i}`} cx={px.toFixed(2)} cy={py.toFixed(2)} r={3} fill="hsl(300 100% 70%)" stroke="hsl(0 0% 2%)" strokeWidth={1.5}
            onMouseEnter={() => setHovered(`b-${axesB[i].key}`)}
            onMouseLeave={() => setHovered(null)} />
        ))}

        {labelPositions.map(({ lx, ly, anchor, axis }, i) => {
          const hoveredA = hovered === `a-${axis.key}`;
          const hoveredB = hovered === `b-${axis.key}`;
          const valueA = axesA[i].value.toFixed(1);
          const valueB = axesB[i].value.toFixed(1);
          return (
            <g key={axis.key}>
              <text
                x={lx.toFixed(2)}
                y={(ly - 6).toFixed(2)}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize={8.5}
                fontFamily="'JetBrains Mono', monospace"
                fill="hsl(0 0% 65%)"
              >
                {axis.label}
              </text>
              <text
                x={lx.toFixed(2)}
                y={(ly + 5).toFixed(2)}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize={7.5}
                fontFamily="'JetBrains Mono', monospace"
                fill={hoveredA || hoveredB ? "white" : "hsl(0 0% 45%)"}
              >
                <tspan fill="hsl(188 100% 50%)">{valueA}</tspan>
                {" / "}
                <tspan fill="hsl(300 100% 70%)">{valueB}</tspan>
              </text>
            </g>
          );
        })}
      </svg>

      <div className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-3 text-[9px] font-mono whitespace-nowrap">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: "hsl(188 100% 50%)" }} />
          <span className="text-zinc-400">{labelA}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: "hsl(300 100% 70%)" }} />
          <span className="text-zinc-400">{labelB}</span>
        </span>
      </div>
    </div>
  );
}
