import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-0 right-0 z-50 p-4 w-full md:max-w-[420px] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            className={cn(
              "pointer-events-auto flex items-start gap-3 w-full p-4 rounded-xl shadow-lg border backdrop-blur-md",
              toast.variant === "destructive" 
                ? "bg-destructive/10 border-destructive/20 text-destructive-foreground"
                : "bg-card/80 border-border text-card-foreground"
            )}
          >
            {toast.variant === "destructive" ? (
              <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
            )}
            <div className="flex flex-col gap-1">
              {toast.title && <h4 className="text-sm font-semibold">{toast.title}</h4>}
              {toast.description && <p className="text-sm opacity-90">{toast.description}</p>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
