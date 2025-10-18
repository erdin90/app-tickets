'use client';
import { useState } from 'react';
import { useProfile } from '@/lib/useProfile';
import { supabase } from '@/lib/supabase';

export default function UserMenu() {
  const { userId, profile, loading } = useProfile();
  const [open, setOpen] = useState(false);

  if (loading) return <div className="text-sm opacity-70">Cargando…</div>;
  if (!userId) return <a href="/login" className="text-sm underline">Entrar</a>;

  const email = supabase.auth.getUser().then(r => r.data.user?.email).catch(()=>null);

  // Para mostrar email sincrónico mínimo:
  // (si prefieres, puedes guardarlo en state, pero simple así para ahora)
  return (
  <div className="relative">
    <button
      onClick={() => setOpen(v => !v)}
      className="px-3 py-1 border rounded text-sm"
    >
      {profile?.role?.toUpperCase() ?? ""} ▾
    </button>

    {open && (
      <div className="absolute right-0 mt-2 w-56 border rounded bg-white dark:bg-neutral-900 p-2 text-sm shadow">
        <div className="px-2 py-1 opacity-80 truncate">Cuenta iniciada</div>
        <div className="px-2 py-1">
          Rol: <b>{profile?.role}</b>
        </div>

        {/* 👇 PERFIL con link nativo */}
        <a
          href="/profile"
          onClick={() => setOpen(false)} // cierra el menú al navegar
          className="block px-2 py-1 hover:underline"
        >
          Perfil
        </a>

        <button
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
          className="mt-1 w-full text-left px-2 py-1 hover:underline"
        >
          Salir
        </button>
      </div>
    )}
  </div>
);

}
