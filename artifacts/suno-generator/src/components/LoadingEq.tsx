import { motion } from "framer-motion";

export function LoadingEq() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <div className="flex items-end justify-center gap-1.5 h-16">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <motion.div
            key={i}
            className="w-2.5 bg-gradient-to-t from-secondary to-primary rounded-full"
            animate={{ 
              height: ["20%", "100%", "20%"] 
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-muted-foreground text-sm font-medium tracking-wide uppercase animate-pulse"
      >
        Extracting Metadata & Synthesizing AI Prompt...
      </motion.p>
    </div>
  );
}
