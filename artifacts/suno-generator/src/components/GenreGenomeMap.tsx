import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface GenreNode {
  id: string;
  label: string;
  group: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  active: boolean;
}

interface GenreEdge {
  source: string;
  target: string;
  strength: number;
}

interface GenreGenomeMapProps {
  activeGenres?: string[];
  onSelectGenre?: (genre: string) => void;
  onClose?: () => void;
  className?: string;
}

// Genre relationship data
const GENRE_DATA: Array<{ id: string; label: string; group: string }> = [
  // Electronic
  { id: "house", label: "House", group: "electronic" },
  { id: "techno", label: "Techno", group: "electronic" },
  { id: "trance", label: "Trance", group: "electronic" },
  { id: "drum-bass", label: "Drum & Bass", group: "electronic" },
  { id: "dubstep", label: "Dubstep", group: "electronic" },
  { id: "ambient", label: "Ambient", group: "electronic" },
  { id: "edm", label: "EDM", group: "electronic" },
  { id: "synthwave", label: "Synthwave", group: "electronic" },
  { id: "lo-fi", label: "Lo-Fi", group: "electronic" },
  // Hip-Hop
  { id: "hip-hop", label: "Hip-Hop", group: "hiphop" },
  { id: "trap", label: "Trap", group: "hiphop" },
  { id: "boom-bap", label: "Boom Bap", group: "hiphop" },
  { id: "drill", label: "Drill", group: "hiphop" },
  { id: "r-b", label: "R&B", group: "hiphop" },
  { id: "neo-soul", label: "Neo-Soul", group: "hiphop" },
  // Rock
  { id: "rock", label: "Rock", group: "rock" },
  { id: "metal", label: "Metal", group: "rock" },
  { id: "punk", label: "Punk", group: "rock" },
  { id: "indie", label: "Indie", group: "rock" },
  { id: "grunge", label: "Grunge", group: "rock" },
  { id: "alternative", label: "Alternative", group: "rock" },
  // Pop
  { id: "pop", label: "Pop", group: "pop" },
  { id: "k-pop", label: "K-Pop", group: "pop" },
  { id: "dance-pop", label: "Dance Pop", group: "pop" },
  { id: "synth-pop", label: "Synth-Pop", group: "pop" },
  { id: "electropop", label: "Electropop", group: "pop" },
  // Jazz/Blues
  { id: "jazz", label: "Jazz", group: "jazz" },
  { id: "blues", label: "Blues", group: "jazz" },
  { id: "soul", label: "Soul", group: "jazz" },
  { id: "funk", label: "Funk", group: "jazz" },
  { id: "gospel", label: "Gospel", group: "jazz" },
  // Classical/Orchestral
  { id: "classical", label: "Classical", group: "classical" },
  { id: "orchestral", label: "Orchestral", group: "classical" },
  { id: "cinematic", label: "Cinematic", group: "classical" },
  // Other
  { id: "reggae", label: "Reggae", group: "other" },
  { id: "country", label: "Country", group: "other" },
  { id: "folk", label: "Folk", group: "other" },
  { id: "latin", label: "Latin", group: "other" },
];

const EDGES: GenreEdge[] = [
  // Electronic connections
  { source: "house", target: "techno", strength: 0.9 },
  { source: "house", target: "trance", strength: 0.7 },
  { source: "house", target: "edm", strength: 0.8 },
  { source: "techno", target: "drum-bass", strength: 0.6 },
  { source: "drum-bass", target: "dubstep", strength: 0.7 },
  { source: "ambient", target: "synthwave", strength: 0.6 },
  { source: "synthwave", target: "lo-fi", strength: 0.5 },
  { source: "synthwave", target: "synth-pop", strength: 0.8 },
  { source: "lo-fi", target: "hip-hop", strength: 0.7 },
  { source: "edm", target: "dance-pop", strength: 0.8 },
  { source: "edm", target: "electropop", strength: 0.7 },
  // Hip-Hop connections
  { source: "hip-hop", target: "trap", strength: 0.9 },
  { source: "hip-hop", target: "boom-bap", strength: 0.8 },
  { source: "trap", target: "drill", strength: 0.8 },
  { source: "hip-hop", target: "r-b", strength: 0.8 },
  { source: "r-b", target: "neo-soul", strength: 0.9 },
  { source: "r-b", target: "soul", strength: 0.9 },
  { source: "neo-soul", target: "jazz", strength: 0.7 },
  { source: "neo-soul", target: "funk", strength: 0.7 },
  // Rock connections
  { source: "rock", target: "metal", strength: 0.7 },
  { source: "rock", target: "punk", strength: 0.7 },
  { source: "punk", target: "grunge", strength: 0.8 },
  { source: "grunge", target: "alternative", strength: 0.9 },
  { source: "alternative", target: "indie", strength: 0.8 },
  { source: "rock", target: "blues", strength: 0.7 },
  // Pop connections
  { source: "pop", target: "dance-pop", strength: 0.9 },
  { source: "pop", target: "electropop", strength: 0.8 },
  { source: "pop", target: "k-pop", strength: 0.6 },
  { source: "synth-pop", target: "electropop", strength: 0.9 },
  { source: "dance-pop", target: "electropop", strength: 0.8 },
  { source: "pop", target: "indie", strength: 0.6 },
  // Jazz/Blues connections
  { source: "jazz", target: "blues", strength: 0.8 },
  { source: "blues", target: "soul", strength: 0.8 },
  { source: "soul", target: "gospel", strength: 0.8 },
  { source: "funk", target: "soul", strength: 0.9 },
  { source: "jazz", target: "classical", strength: 0.5 },
  // Classical connections
  { source: "classical", target: "orchestral", strength: 0.95 },
  { source: "orchestral", target: "cinematic", strength: 0.9 },
  { source: "ambient", target: "cinematic", strength: 0.6 },
  // Other connections
  { source: "reggae", target: "hip-hop", strength: 0.5 },
  { source: "country", target: "folk", strength: 0.8 },
  { source: "folk", target: "indie", strength: 0.6 },
  { source: "latin", target: "pop", strength: 0.5 },
  { source: "gospel", target: "r-b", strength: 0.7 },
];

const GROUP_COLORS: Record<string, string> = {
  electronic: "#00e5ff",
  hiphop: "#ff9800",
  rock: "#f44336",
  pop: "#e91e63",
  jazz: "#9c27b0",
  classical: "#3f51b5",
  other: "#4caf50",
};

function normalize(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
}

function findNodeId(genre: string): string | null {
  const norm = normalize(genre);
  const direct = GENRE_DATA.find((n) => n.id === norm || n.label.toLowerCase() === genre.toLowerCase());
  if (direct) return direct.id;
  const partial = GENRE_DATA.find((n) => n.label.toLowerCase().includes(genre.toLowerCase()) || genre.toLowerCase().includes(n.label.toLowerCase()));
  return partial?.id ?? null;
}

export function GenreGenomeMap({ activeGenres = [], onSelectGenre, onClose, className }: GenreGenomeMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GenreNode[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const activeIds = activeGenres.map((g) => findNodeId(g)).filter(Boolean) as string[];

  // Initialize nodes with random positions
  useEffect(() => {
    const W = 480, H = 380;
    nodesRef.current = GENRE_DATA.map((gd) => ({
      ...gd,
      x: 60 + Math.random() * (W - 120),
      y: 60 + Math.random() * (H - 120),
      vx: 0,
      vy: 0,
      radius: activeIds.includes(gd.id) ? 14 : 9,
      active: activeIds.includes(gd.id),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update active state when activeGenres changes
  useEffect(() => {
    nodesRef.current = nodesRef.current.map((n) => ({
      ...n,
      active: activeIds.includes(n.id),
      radius: activeIds.includes(n.id) ? 14 : 9,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGenres.join(",")]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const nodes = nodesRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw edges
    for (const edge of EDGES) {
      const src = nodes.find((n) => n.id === edge.source);
      const tgt = nodes.find((n) => n.id === edge.target);
      if (!src || !tgt) continue;
      const bothActive = src.active && tgt.active;
      const eitherActive = src.active || tgt.active;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = bothActive
        ? `rgba(255,255,255,${edge.strength * 0.6})`
        : eitherActive
        ? `rgba(255,255,255,${edge.strength * 0.25})`
        : `rgba(255,255,255,${edge.strength * 0.06})`;
      ctx.lineWidth = bothActive ? 1.5 : eitherActive ? 1 : 0.5;
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodes) {
      const color = GROUP_COLORS[node.group] ?? "#888";
      const isHovered = hoveredNode === node.id;

      // Outer glow for active
      if (node.active || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = `${color}22`;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.active
        ? color
        : isHovered
        ? `${color}cc`
        : `${color}44`;
      ctx.fill();
      ctx.strokeStyle = node.active ? `${color}` : `${color}66`;
      ctx.lineWidth = node.active ? 1.5 : 1;
      ctx.stroke();

      // Label
      ctx.fillStyle = node.active
        ? "#fff"
        : isHovered
        ? "rgba(255,255,255,0.9)"
        : "rgba(255,255,255,0.5)";
      ctx.font = `${node.active ? "bold " : ""}${node.active ? 9 : 8}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(node.label, node.x, node.y + node.radius + 11);
    }

    ctx.restore();
  }, [hoveredNode, zoom, pan]);

  // Force-directed simulation
  useEffect(() => {
    const simulate = () => {
      const nodes = nodesRef.current;
      const W = 480, H = 380;
      const REPULSION = 800;
      const EDGE_STRENGTH = 0.012;
      const CENTER_PULL = 0.003;
      const DAMPING = 0.88;

      // Repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
          const force = REPULSION / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Attraction along edges
      for (const edge of EDGES) {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const force = (dist - 80) * EDGE_STRENGTH * edge.strength;
        src.vx += (dx / dist) * force;
        src.vy += (dy / dist) * force;
        tgt.vx -= (dx / dist) * force;
        tgt.vy -= (dy / dist) * force;
      }

      // Center pull
      for (const node of nodes) {
        node.vx += (W / 2 - node.x) * CENTER_PULL;
        node.vy += (H / 2 - node.y) * CENTER_PULL;
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.x += node.vx;
        node.y += node.vy;
        node.x = Math.max(node.radius + 5, Math.min(W - node.radius - 5, node.x));
        node.y = Math.max(node.radius + 5, Math.min(H - node.radius - 5, node.y));
      }

      draw();
      animRef.current = requestAnimationFrame(simulate);
    };
    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  const getNodeAtPoint = (cx: number, cy: number): GenreNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = (cx - rect.left - pan.x) / zoom;
    const my = (cy - rect.top - pan.y) / zoom;
    const nodes = nodesRef.current;
    for (const node of [...nodes].reverse()) {
      const dx = node.x - mx;
      const dy = node.y - my;
      if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 4) return node;
    }
    return null;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging.current) {
      setPan((p) => ({ x: p.x + e.clientX - lastMouse.current.x, y: p.y + e.clientY - lastMouse.current.y }));
      lastMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const node = getNodeAtPoint(e.clientX, e.clientY);
    setHoveredNode(node?.id ?? null);
    if (canvasRef.current) canvasRef.current.style.cursor = node ? "pointer" : "grab";
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const node = getNodeAtPoint(e.clientX, e.clientY);
    if (node && onSelectGenre) onSelectGenre(node.label);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const node = getNodeAtPoint(e.clientX, e.clientY);
    if (!node) {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = hoveredNode ? "pointer" : "grab";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className={cn("bg-card border border-primary/25 overflow-hidden", className)}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-primary/10">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">Genre Genome Map</span>
          {activeIds.length > 0 && (
            <span className="font-mono text-[10px] text-zinc-600">{activeIds.length} active</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom((z) => Math.min(z + 0.2, 3))} className="p-1 border border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-colors">
            <ZoomIn className="w-3 h-3" />
          </button>
          <button onClick={() => setZoom((z) => Math.max(z - 0.2, 0.4))} className="p-1 border border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-colors">
            <ZoomOut className="w-3 h-3" />
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1 border border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-colors">
            <RotateCcw className="w-3 h-3" />
          </button>
          {onClose && (
            <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors ml-1">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={480}
        height={380}
        className="w-full bg-zinc-950/60 select-none"
        style={{ cursor: "grab" }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Legend */}
      <div className="px-5 py-3 border-t border-primary/10">
        <div className="flex flex-wrap gap-2">
          {Object.entries(GROUP_COLORS).map(([group, color]) => (
            <div key={group} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="font-mono text-[8px] text-zinc-600 capitalize">{group === "hiphop" ? "Hip-Hop" : group}</span>
            </div>
          ))}
        </div>
        <p className="font-mono text-[8px] text-zinc-700 mt-1.5">
          {onSelectGenre ? "Click a node to select/deselect genre · " : ""}
          Drag background to pan · Active genres highlighted
        </p>
      </div>
    </motion.div>
  );
}
