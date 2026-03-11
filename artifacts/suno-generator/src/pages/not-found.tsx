import { Link } from "wouter";
import { motion } from "framer-motion";
import { Music, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Background Graphic */}
      <div className="absolute inset-0 z-0 bg-primary/5 blur-[150px] rounded-full pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 flex flex-col items-center text-center max-w-md"
      >
        <div className="w-24 h-24 bg-card border border-border rounded-full flex items-center justify-center mb-6 shadow-xl">
          <Music className="w-10 h-10 text-muted-foreground opacity-50" />
        </div>
        
        <h1 className="text-4xl font-bold mb-4">Track Not Found</h1>
        <p className="text-muted-foreground mb-8 text-lg">
          Looks like this frequency doesn't exist. The page you are looking for has been removed or relocated.
        </p>
        
        <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-white/10 hover:bg-white/15 text-foreground border border-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Generator
        </Link>
      </motion.div>
    </div>
  );
}
