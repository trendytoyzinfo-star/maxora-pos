import { LifeBuoy } from "lucide-react";

export function BrandFooter({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="border-t border-sidebar-border px-1 py-3 text-center">
        <a href="https://maxora.example.com/" target="_blank" rel="noopener noreferrer" className="text-[10px] font-medium leading-tight text-sidebar-foreground/70 hover:underline">Maxora</a>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-sidebar-border px-4 py-3">
      <a
        href="https://maxora.example.com/contact"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 rounded-lg border border-sidebar-border px-3 py-1.5 text-xs font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LifeBuoy className="h-3.5 w-3.5" />
        Contact support
      </a>
      <a
        href="https://maxora.example.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-left text-xs font-medium leading-tight text-sidebar-foreground/70 hover:text-sidebar-foreground hover:underline"
      >
        Made by Maxora
      </a>
    </div>
  );
}
