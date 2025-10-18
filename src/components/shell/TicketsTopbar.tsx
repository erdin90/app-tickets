"use client";
import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { ChevronDown, Download } from "lucide-react";

function GhostButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      className={cn(
        "inline-flex items-center gap-2 rounded-xl bg-transparent hover:bg-neutral-100 text-neutral-700 text-sm px-3.5 py-2",
        className
      )}
      {...rest}
    />
  );
}

export default function TicketsTopbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto max-w-screen-2xl h-16 flex items-center justify-between px-4">
        {/* Filtros estilo chips */}
        <div className="flex items-center gap-2">
          <GhostButton>Últimos 15 días <ChevronDown className="h-4 w-4" /></GhostButton>
          <GhostButton>Todos los estados <ChevronDown className="h-4 w-4" /></GhostButton>
          <GhostButton>Todos los agentes <ChevronDown className="h-4 w-4" /></GhostButton>
        </div>

        {/* Acciones */}
        <button className="inline-flex items-center gap-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-sm px-3.5 py-2">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>
    </header>
  );
}
