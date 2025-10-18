"use client";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function AppHeader() {
  return (
    <header className="appbar">
      <div className="brand"><Link href="/" style={{ textDecoration:"none", color:"inherit" }}>IT System</Link></div>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <Link className="btn btn-ghost" href="/dashboard">Tickets</Link>
        <Link className="btn btn-ghost" href="/profile">Perfil</Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
