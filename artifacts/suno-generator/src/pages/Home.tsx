import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Youtube, Wand2, AlertCircle } from "lucide-react";
import { useGenerateSunoTemplate } from "@workspace/api-client-react";
import { TemplateResult } from "@/components/TemplateResult";
import { LoadingEq } from "@/components/LoadingEq";

const formSchema = z.object({
  youtubeUrl: z.string().url("Please enter a valid URL").refine(
    (url) => url.includes("youtube.com") || url.includes("youtu.be"),
    "Must be a valid YouTube URL (youtube.com or youtu.be)"
  ),
});

type FormValues = z.infer<typeof formSchema>;

export default function Home() {
  const { mutate, isPending, data, error } = useGenerateSunoTemplate();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      youtubeUrl: "",
    },
  });

  const onSubmit = (values: FormValues) => {
    mutate({ data: { youtubeUrl: values.youtubeUrl } });
  };

  const errorMessage = error?.response?.data?.error || error?.message;

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-start pt-20 px-4 pb-24 overflow-x-hidden">
      {/* Background Graphic */}
      <div
        className="fixed inset-0 z-0 opacity-20 bg-cover bg-center bg-no-repeat mix-blend-screen pointer-events-none"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/hero-bg.png)` }}
      />
      
      {/* Ambient glowing orbs */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-3xl flex flex-col items-center mb-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-center text-center space-y-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
            <SparkleIcon className="w-4 h-4 text-secondary" />
            <span className="text-sm font-medium tracking-wide text-zinc-300">Suno.ai Prompt Generator</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-white via-zinc-200 to-zinc-500 drop-shadow-sm pb-2">
            Track to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Template</span>
          </h1>
          
          <p className="text-lg md:text-xl text-zinc-400 max-w-xl font-medium leading-relaxed">
            Paste any YouTube song link. Our AI will extract its soul and construct the perfect Suno prompt for you to remix, recreate, or be inspired.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className="w-full mt-10"
        >
          <form 
            onSubmit={form.handleSubmit(onSubmit)} 
            className="flex flex-col sm:flex-row gap-3 relative"
          >
            <div className="relative flex-1 group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-2xl blur-md opacity-20 group-focus-within:opacity-50 transition-opacity duration-500" />
              <div className="relative flex items-center bg-card border-2 border-border focus-within:border-primary/50 rounded-2xl overflow-hidden transition-all shadow-xl">
                <div className="pl-5 pr-3 text-muted-foreground">
                  <Youtube className="w-6 h-6" />
                </div>
                <input
                  {...form.register("youtubeUrl")}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full py-4 pr-5 bg-transparent border-none text-foreground placeholder:text-zinc-600 focus:outline-none focus:ring-0 text-lg font-medium"
                  autoComplete="off"
                  disabled={isPending}
                />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={isPending}
              className="relative shrink-0 px-8 py-4 sm:py-0 rounded-2xl font-bold text-white shadow-xl flex items-center justify-center gap-2 group overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary group-hover:scale-105 transition-transform duration-300" />
              <span className="relative z-10 flex items-center gap-2 text-lg">
                {isPending ? "Analyzing..." : "Generate"}
                {!isPending && <Wand2 className="w-5 h-5 group-hover:rotate-12 transition-transform" />}
              </span>
            </button>
          </form>
          
          {form.formState.errors.youtubeUrl && (
            <motion.p 
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 text-destructive font-medium flex items-center gap-2 pl-2"
            >
              <AlertCircle className="w-4 h-4" />
              {form.formState.errors.youtubeUrl.message}
            </motion.p>
          )}
          
          {errorMessage && (
            <motion.p 
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 text-destructive font-medium flex items-center gap-2 pl-2 bg-destructive/10 p-3 rounded-lg border border-destructive/20"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              {errorMessage}
            </motion.p>
          )}
        </motion.div>
      </div>

      {/* Results Area */}
      <div className="w-full relative z-10 flex-1 flex flex-col justify-start pt-8">
        <AnimatePresence mode="wait">
          {isPending ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="w-full flex justify-center py-12"
            >
              <LoadingEq />
            </motion.div>
          ) : data ? (
            <motion.div 
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <TemplateResult template={data} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Sparkle helper component
function SparkleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}
