import { motion } from "framer-motion";

interface ExampleItem {
  song: string;
  artist: string;
  youtubeUrl: string;
  thumbnail: string;
  genres: string[];
  era: string;
}

const EXAMPLES: ExampleItem[] = [
  {
    song: "Never Gonna Give You Up",
    artist: "Rick Astley",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
    genres: ["Dance Pop", "Synth-Pop"],
    era: "80s",
  },
  {
    song: "Blinding Lights",
    artist: "The Weeknd",
    youtubeUrl: "https://www.youtube.com/watch?v=4NRXx6U8ABQ",
    thumbnail: "https://img.youtube.com/vi/4NRXx6U8ABQ/mqdefault.jpg",
    genres: ["Synthwave", "Electropop"],
    era: "2010s",
  },
  {
    song: "HUMBLE.",
    artist: "Kendrick Lamar",
    youtubeUrl: "https://www.youtube.com/watch?v=tvTRZJ-4EyI",
    thumbnail: "https://img.youtube.com/vi/tvTRZJ-4EyI/mqdefault.jpg",
    genres: ["Hip-Hop", "Trap"],
    era: "2010s",
  },
  {
    song: "Bohemian Rhapsody",
    artist: "Queen",
    youtubeUrl: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
    thumbnail: "https://img.youtube.com/vi/fJ9rUzIMcZQ/mqdefault.jpg",
    genres: ["Classic Rock", "Prog Rock"],
    era: "70s",
  },
];

interface ExampleGalleryProps {
  onSelect: (url: string) => void;
}

export function ExampleGallery({ onSelect }: ExampleGalleryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="w-full max-w-3xl mt-10"
    >
      <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest mb-3">Try an example</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.youtubeUrl}
            type="button"
            onClick={() => onSelect(ex.youtubeUrl)}
            className="group flex flex-col overflow-hidden border border-primary/10 hover:border-primary/40 bg-card transition-all text-left"
          >
            <div className="relative overflow-hidden">
              <img
                src={ex.thumbnail}
                alt={ex.song}
                className="w-full h-16 object-cover transition-transform duration-300 group-hover:scale-105 opacity-70 group-hover:opacity-90"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            </div>
            <div className="p-2">
              <p className="font-mono text-[11px] text-zinc-300 leading-tight truncate">{ex.song}</p>
              <p className="font-mono text-[10px] text-primary/50 mt-0.5">{ex.artist} · {ex.era}</p>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {ex.genres.slice(0, 2).map((g) => (
                  <span key={g} className="font-mono text-[9px] px-1 border border-primary/15 text-zinc-600">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
