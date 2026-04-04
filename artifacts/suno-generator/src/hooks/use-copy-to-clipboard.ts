import { useState, useCallback } from "react";
import { useToast } from "./use-toast";

export function useCopyToClipboard() {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const { toast } = useToast();

  const copy = useCallback(
    async (text: string, label: string = "Copied to clipboard!") => {
      if (!navigator?.clipboard) {
        toast({
          title: "Error",
          description: "Clipboard not supported on this device/browser.",
          variant: "destructive",
        });
        return false;
      }

      try {
        await navigator.clipboard.writeText(text);
        setCopiedText(text);
        toast({
          title: "Success",
          description: label,
        });
        setTimeout(() => {
          setCopiedText(null);
        }, 2000);
        return true;
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to copy text.",
          variant: "destructive",
        });
        return false;
      }
    },
    [toast]
  );

  return { copiedText, copy };
}
