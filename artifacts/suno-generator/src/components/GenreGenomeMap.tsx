import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Network, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GenreNode {
  id: string;
  label: string;
  family: string; // genre family for color grouping
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GenreEdge {
  source: string;
  target: string;
  strength: number; // 0–1
}

const GENRE_FAMILIES: Record<string, string> = {
  "Pop": "pop",
  "Dance Pop": "pop",
  "Indie Pop": "pop",
  "Synth-Pop": "pop",
  "Dream Pop": "pop",
  "Electropop": "pop",
  "K-Pop": "pop",
  "J-Pop": "pop",
  "Rock": "rock",
  "Alternative Rock": "rock",
  "Indie Rock": "rock",
  "Hard Rock": "rock",
  "Classic Rock": "rock",
  "Punk": "rock",
  "Grunge": "rock",
  "Shoegaze": "rock",
  "Psychedelic Rock": "rock",
  "Progressive Rock": "rock",
  "Post-Rock": "rock",
  "Metal": "metal",
  "Heavy Metal": "metal",
  "Black Metal": "metal",
  "Death Metal": "metal",
  "Thrash Metal": "metal",
  "Nu Metal": "metal",
  "Metalcore": "metal",
  "Power Metal": "metal",
  "Hip-Hop": "hiphop",
  "Trap": "hiphop",
  "Drill": "hiphop",
  "Boom Bap": "hiphop",
  "Gangsta Rap": "hiphop",
  "Cloud Rap": "hiphop",
  "Phonk": "hiphop",
  "R&B": "rnb",
  "Soul": "rnb",
  "Neo-Soul": "rnb",
  "Funk": "rnb",
  "Motown": "rnb",
  "Gospel": "rnb",
  "House": "electronic",
  "Deep House": "electronic",
  "Tech House": "electronic",
  "Techno": "electronic",
  "Trance": "electronic",
  "Drum & Bass": "electronic",
  "Dubstep": "electronic",
  "Future Bass": "electronic",
  "Synthwave": "electronic",
  "EDM": "electronic",
  "Ambient": "electronic",
  "IDM": "electronic",
  "Jazz": "jazz",
  "Smooth Jazz": "jazz",
  "Bebop": "jazz",
  "Jazz Fusion": "jazz",
  "Acid Jazz": "jazz",
  "Country": "country",
  "Americana": "country",
  "Bluegrass": "country",
  "Folk": "country",
  "Indie Folk": "country",
  "Classical": "classical",
  "Orchestral": "classical",
  "Cinematic": "classical",
  "Reggae": "world",
  "Dancehall": "world",
  "Reggaeton": "world",
  "Latin Pop": "world",
  "Afrobeats": "world",
  "Blues": "blues",
  "Delta Blues": "blues",
  "Chicago Blues": "blues",
  "Lo-Fi": "chill",
  "Chillwave": "chill",
  "Downtempo": "chill",
  "Trip-Hop": "chill",
  "Vaporwave": "chill",
};

const FAMILY_COLORS: Record<string, string> = {
  pop: "#f472b6",
  rock: "#f87171",
  metal: "#dc2626",
  hiphop: "#a78bfa",
  rnb: "#fb923c",
  electronic: "#22d3ee",
  jazz: "#fbbf24",
  country: "#86efac",
  classical: "#c4b5fd",
  world: "#34d399",
  blues: "#60a5fa",
  chill: "#94a3b8",
};

// Edges: pairs of genres that are musically related
const RAW_EDGES: [string, string, number][] = [
  ["Pop", "Dance Pop", 0.95],
  ["Pop", "Synth-Pop", 0.8],
  ["Pop", "Indie Pop", 0.75],
  ["Pop", "Electropop", 0.85],
  ["Pop", "Dream Pop", 0.7],
  ["Pop", "K-Pop", 0.7],
  ["Dance Pop", "House", 0.7],
  ["Dance Pop", "EDM", 0.8],
  ["Synth-Pop", "Synthwave", 0.85],
  ["Synth-Pop", "Electropop", 0.9],
  ["Rock", "Alternative Rock", 0.9],
  ["Rock", "Classic Rock", 0.85],
  ["Rock", "Hard Rock", 0.85],
  ["Rock", "Indie Rock", 0.8],
  ["Rock", "Blues", 0.7],
  ["Rock", "Folk Rock", 0.65],
  ["Alternative Rock", "Indie Rock", 0.85],
  ["Alternative Rock", "Grunge", 0.8],
  ["Alternative Rock", "Post-Rock", 0.7],
  ["Hard Rock", "Metal", 0.8],
  ["Metal", "Heavy Metal", 0.95],
  ["Metal", "Thrash Metal", 0.85],
  ["Metal", "Metalcore", 0.8],
  ["Hip-Hop", "Trap", 0.85],
  ["Hip-Hop", "Boom Bap", 0.85],
  ["Hip-Hop", "Drill", 0.75],
  ["Hip-Hop", "Cloud Rap", 0.8],
  ["Hip-Hop", "Phonk", 0.7],
  ["Hip-Hop", "R&B", 0.7],
  ["R&B", "Soul", 0.85],
  ["R&B", "Neo-Soul", 0.9],
  ["R&B", "Funk", 0.75],
  ["Soul", "Gospel", 0.7],
  ["Soul", "Motown", 0.8],
  ["Funk", "Disco", 0.8],
  ["Funk", "R&B", 0.8],
  ["House", "Deep House", 0.9],
  ["House", "Tech House", 0.85],
  ["House", "Techno", 0.7],
  ["House", "Disco", 0.65],
  ["Techno", "EDM", 0.6],
  ["Trance", "Progressive House", 0.7],
  ["Drum & Bass", "Dubstep", 0.6],
  ["Drum & Bass", "IDM", 0.65],
  ["Future Bass", "EDM", 0.75],
  ["Synthwave", "Electropop", 0.75],
  ["Synthwave", "Chillwave", 0.6],
  ["Ambient", "IDM", 0.65],
  ["Ambient", "Downtempo", 0.7],
  ["Jazz", "Soul", 0.65],
  ["Jazz", "Blues", 0.75],
  ["Jazz", "Funk", 0.7],
  ["Jazz", "Bebop", 0.9],
  ["Jazz", "Jazz Fusion", 0.85],
  ["Country", "Americana", 0.9],
  ["Country", "Folk", 0.75],
  ["Country", "Bluegrass", 0.8],
  ["Folk", "Indie Folk", 0.9],
  ["Folk", "Americana", 0.75],
  ["Classical", "Orchestral", 0.95],
  ["Classical", "Cinematic", 0.8],
  ["Blues", "Delta Blues", 0.9],
  ["Blues", "Chicago Blues", 0.9],
  ["Reggae", "Dancehall", 0.8],
  ["Reggae", "Reggaeton", 0.6],
  ["Lo-Fi", "Chillwave", 0.8],
  ["Lo-Fi", "Downtempo", 0.75],
  ["Lo-Fi", "Hip-Hop", 0.6],
  ["Trip-Hop", "Downtempo", 0.8],
  ["Trip-Hop", "Lo-Fi", 0.7],
  ["Vaporwave", "Synthwave", 0.65],
  ["Vaporwave", "Lo-Fi", 0.6],
];

const ALL_GENRES = [...new Set([
  ...Object.keys(GENRE_FAMILIES),
  ...RAW_EDGES.flatMap(([a, b]) => [a, b]),
])].slice(0, 60); // Limit to 60 for performance

function buildNodes(width: number, height: number): GenreNode[] {
  return ALL_GENRES.map((id) => ({
    id,
    label: id,
    family: GENRE_FAMILIES[id] ?? "pop",
    x: Math.random() * (width - 40) + 20,
    y: Math.random() * (height - 40) + 20,
    vx: 0,
    vy: 0,
  }));
}

function buildEdges(): GenreEdge[] {
  return RAW_EDGES
    .filter(([a, b]) => ALL_GENRES.includes(a) && ALL_GENRES.includes(b))
    .map(([source, target, strength]) => ({ source, target, strength }));
}

interface GenreGenomeMapProps {
  selectedGenres?: string[];
  onSelectGenre?: (genre: string) => void;
  className?: string;
}

export function GenreGenomeMap({ selectedGenres = [], onSelectGenre, className }: GenreGenomeMapProps) {
  const [expanded, setExpanded] = useState(false);
  const [nodes, setNodes] = useState<GenreNode[]>([]);
  const [edges] = useState<GenreEdge[]>(buildEdges);
  const [hovered, setHovered] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GenreNode[]>([]);
  const W = 700;
  const H = 420;

  // Initialize nodes
  useEffect(() => {
    if (!expanded) return;
    const initial = buildNodes(W, H);
    setNodes(initial);
    nodesRef.current = initial;
  }, [expanded]);

  // Force simulation
  useEffect(() => {
    if (!expanded || nodesRef.current.length === 0) return;

    const REPULSION = 1800;
    const ATTRACTION = 0.018;
    const CENTERING = 0.008;
    const DAMPING = 0.88;
    const MIN_DIST = 55;

    const tick = () => {
      const ns = nodesRef.current.map((n) => ({ ...n }));

      // Repulsion between all nodes
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[i].x - ns[j].x;
          const dy = ns[i].y - ns[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), MIN_DIST);
          const force = REPULSION / (dist * dist);
          const nx = (dx / dist) * force;
          const ny = (dy / dist) * force;
          ns[i].vx += nx;
          ns[i].vy += ny;
          ns[j].vx -= nx;
          ns[j].vy -= ny;
        }
      }

      // Edge attraction
      for (const edge of edges) {
        const si = ns.findIndex((n) => n.id === edge.source);
        const ti = ns.findIndex((n) => n.id === edge.target);
        if (si < 0 || ti < 0) continue;
        const dx = ns[ti].x - ns[si].x;
        const dy = ns[ti].y - ns[si].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const targetDist = 80 + (1 - edge.strength) * 80;
        const force = (dist - targetDist) * ATTRACTION * edge.strength;
        ns[si].vx += (dx / dist) * force;
        ns[si].vy += (dy / dist) * force;
        ns[ti].vx -= (dx / dist) * force;
        ns[ti].vy -= (dy / dist) * force;
      }

      // Center gravity
      const cx = W / 2;
      const cy = H / 2;
      for (const n of ns) {
        n.vx += (cx - n.x) * CENTERING;
        n.vy += (cy - n.y) * CENTERING;
      }

      // Integrate + dampen + clamp
      for (const n of ns) {
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x = Math.max(30, Math.min(W - 30, n.x + n.vx));
        n.y = Math.max(18, Math.min(H - 18, n.y + n.vy));
      }

      nodesRef.current = ns;
      setNodes([...ns]);
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    // Stop after 5s (settled)
    const stopTimer = setTimeout(() => cancelAnimationFrame(animRef.current), 5000);
    return () => {
      cancelAnimationFrame(animRef.current);
      clearTimeout(stopTimer);
    };
  }, [expanded, edges]);

  const getNode = useCallback((id: string) => nodes.find((n) => n.id === id), [nodes]);

  const isHighlighted = useCallback((id: string) => {
    if (!hovered) return true;
    if (id === hovered) return true;
    return edges.some(
      (e) => (e.source === hovered && e.target === id) || (e.target === hovered && e.source === id)
    );
  }, [hovered, edges]);

  const filteredNodes = search
    ? nodes.filter((n) => n.label.toLowerCase().includes(search.toLowerCase()))
    : nodes;

  return (
    <div className={cn("w-full bg-card border border-primary/15 overflow-hidden", className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left hover:bg-primary/3 transition-colors"
      >
        <Network className="w-4 h-4 text-primary/60 shrink-0" />
        <div className="flex-1">
          <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">Genre Genome Map</span>
          <span className="font-mono text-[11px] text-zinc-400 leading-tight">
            Interactive genre relationship explorer — click to select
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-primary/10">
              {/* Search + legend */}
              <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-primary/8">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search genres..."
                  className="flex-1 min-w-32 bg-zinc-900/60 border border-primary/15 px-2.5 py-1 font-mono text-[11px] text-zinc-300 focus:outline-none focus:border-primary/40"
                />
                <div className="flex flex-wrap gap-2">
                  {Object.entries(FAMILY_COLORS).slice(0, 6).map(([family, color]) => (
                    <div key={family} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="font-mono text-[9px] text-zinc-600 capitalize">{family}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SVG canvas */}
              <div className="relative w-full overflow-x-auto">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${W} ${H}`}
                  className="w-full"
                  style={{ height: H, maxHeight: H }}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Edges */}
                  {edges.map((e) => {
                    const sn = getNode(e.source);
                    const tn = getNode(e.target);
                    if (!sn || !tn) return null;
                    const active = hovered === e.source || hovered === e.target;
                    return (
                      <line
                        key={`${e.source}-${e.target}`}
                        x1={sn.x} y1={sn.y}
                        x2={tn.x} y2={tn.y}
                        stroke={active ? "#22d3ee" : "#ffffff"}
                        strokeOpacity={active ? 0.4 * e.strength : 0.04 * e.strength}
                        strokeWidth={active ? e.strength * 2.5 : e.strength * 1}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {nodes.map((node) => {
                    const color = FAMILY_COLORS[node.family] ?? "#94a3b8";
                    const isSelected = selectedGenres.includes(node.id);
                    const isHov = hovered === node.id;
                    const highlight = isHighlighted(node.id);
                    const isSearchMatch = search && node.label.toLowerCase().includes(search.toLowerCase());
                    const visible = !search || isSearchMatch;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x},${node.y})`}
                        style={{ cursor: "pointer", opacity: visible ? (highlight ? 1 : 0.25) : 0.08 }}
                        onMouseEnter={() => setHovered(node.id)}
                        onClick={() => onSelectGenre?.(node.id)}
                      >
                        <circle
                          r={isHov ? 7 : isSelected ? 6 : 4.5}
                          fill={color}
                          fillOpacity={isSelected ? 1 : isHov ? 0.9 : 0.6}
                          stroke={isSelected ? "#ffffff" : isHov ? color : "transparent"}
                          strokeWidth={isSelected ? 2 : 1.5}
                          style={{ transition: "r 0.15s, fill-opacity 0.15s" }}
                        />
                        {(isHov || isSelected || isSearchMatch) && (
                          <text
                            y={-10}
                            textAnchor="middle"
                            className="font-mono"
                            fontSize={9}
                            fill={isSelected ? color : "#e4e4e7"}
                            fontWeight={isSelected ? "bold" : "normal"}
                            style={{ pointerEvents: "none", userSelect: "none" }}
                          >
                            {node.label}
                          </text>
                        )}
                        {!isHov && !isSelected && !isSearchMatch && (
                          <text
                            y={-8}
                            textAnchor="middle"
                            fontSize={7.5}
                            fill="#71717a"
                            style={{ pointerEvents: "none", userSelect: "none" }}
                          >
                            {node.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Selected genres */}
              {selectedGenres.length > 0 && (
                <div className="px-4 py-3 border-t border-primary/8 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Selected:</span>
                  {selectedGenres.map((g) => (
                    <button
                      key={g}
                      onClick={() => onSelectGenre?.(g)}
                      className="flex items-center gap-1 px-2 py-0.5 border border-primary/25 font-mono text-[10px] text-primary hover:border-primary/50 transition-all"
                    >
                      {g}
                      <X className="w-2.5 h-2.5" />
                    </button>
                  ))}
                </div>
              )}

              {/* Hover info */}
              {hovered && (
                <div className="px-4 py-2.5 border-t border-primary/8 bg-primary/3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: FAMILY_COLORS[GENRE_FAMILIES[hovered] ?? "pop"] }}
                    />
                    <span className="font-mono text-[11px] text-white font-medium">{hovered}</span>
                    <span className="font-mono text-[10px] text-zinc-500 capitalize">
                      {GENRE_FAMILIES[hovered] ?? "genre"} family
                    </span>
                    <span className="font-mono text-[10px] text-zinc-600">
                      {edges.filter((e) => e.source === hovered || e.target === hovered).length} related genres
                    </span>
                    {onSelectGenre && (
                      <button
                        onClick={() => onSelectGenre(hovered)}
                        className="flex items-center gap-1 ml-auto px-2 py-0.5 font-mono text-[10px] border border-primary/30 text-primary hover:bg-primary/10 transition-all"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        {selectedGenres.includes(hovered) ? "Remove" : "Add"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
