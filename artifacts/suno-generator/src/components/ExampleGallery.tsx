import { motion } from "framer-motion";
import { Sparkles, ExternalLink } from "lucide-react";

interface ExampleItem {
  song: string;
  artist: string;
  youtubeUrl: string;
  thumbnail: string;
  genres: string[];
  era: string;
  styleSnippet: string;
}

const EXAMPLES: ExampleItem[] = [
  {
    song: "Never Gonna Give You Up",
    artist: "Rick Astley",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
    genres: ["Dance Pop", "Synth-Pop", "Hi-NRG"],
    era: "80s",
    styleSnippet: "1987, DANCE-POP, Hi-NRG, Stock Aitken Waterman production, 113 BPM, B minor…",
  },
  {
    song: "Blinding Lights",
    artist: "The Weeknd",
    youtubeUrl: "https://www.youtube.com/watch?v=4NRXx6U8ABQ",
    thumbnail: "https://img.youtube.com/vi/4NRXx6U8ABQ/mqdefault.jpg",
    genres: ["Synthwave", "Electropop", "Dance Pop"],
    era: "2010s",
    styleSnippet: "2019, SYNTHWAVE, Electropop, dark 80s-inspired, 171 BPM, F minor…",
  },
  {
    song: "HUMBLE.",
    artist: "Kendrick Lamar",
    youtubeUrl: "https://www.youtube.com/watch?v=tvTRZJ-4EyI",
    thumbnail: "https://img.youtube.com/vi/tvTRZJ-4EyI/mqdefault.jpg",
    genres: ["Hip-Hop", "Trap", "West Coast Rap"],
    era: "2010s",
    styleSnippet: "2017, HIP-HOP, Trap, Mike Will Made-It production, 150 BPM, minimalist beat…",
  },
  {
    song: "Bohemian Rhapsody",
    artist: "Queen",
    youtubeUrl: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
    thumbnail: "https://img.youtube.com/vi/fJ9rUzIMcZQ/mqdefault.jpg",
    genres: ["Classic Rock", "Progressive Rock", "Arena Rock"],
    era: "70s",
    styleSnippet: "1975, CLASSIC ROCK, Progressive Rock, multi-section operatic suite…",
  },
];

interface ExampleGalleryProps {
  onSelect: (url: string) => void;
}

export function ExampleGallery({ onSelect }: ExampleGalleryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="w-full max-w-3xl mt-16"
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-secondary" />
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Try an example</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {EXAMPLES.map((ex) => (
          <motion.button
            key={ex.youtubeUrl}
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={() => onSelect(ex.youtubeUrl)}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card/40 backdrop-blur-sm text-left transition-all hover:border-secondary/40 hover:shadow-lg hover:shadow-secondary/10"
          >
            <div className="relative overflow-hidden">
              <img
                src={ex.thumbnail}
                alt={ex.song}
                className="w-full h-20 object-cover transition-transform duration-300 group-hover:scale-105"
                onError={(e) => { (e.target as HTMLImageElement).src = ""; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-1.5 left-2 right-2 flex flex-wrap gap-1">
                {ex.genres.slice(0, 2).map((g) => (
                  <span key={g} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-black/50 text-zinc-300 backdrop-blur-sm">
                    {g}
                  </span>
                ))}
              </div>
            </div>
            <div className="p-2.5">
              <p className="text-xs font-semibold text-foreground leading-tight line-clamp-1">{ex.song}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{ex.artist} · {ex.era}</p>
              <p className="text-[9px] text-zinc-600 mt-1.5 line-clamp-2 leading-snug italic">{ex.styleSnippet}</p>
            </div>
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-5 h-5 rounded-full bg-secondary/80 flex items-center justify-center">
                <ExternalLink className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
