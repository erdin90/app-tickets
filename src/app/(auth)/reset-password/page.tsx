'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  // Cuando llegas desde el correo, Supabase establece la sesión temporal automáticamente
  useEffect(() => {
    // No necesitamos nada extra aquí en la mayoría de los casos recientes de supabase-js v2
  }, []);

  const update = async () => {
    setMsg(null);
    const { data, error } = await supabase.auth.updateUser({ password });
    setMsg(error ? error.message : 'Contraseña actualizada. Ya puedes iniciar sesión.');
    if (!error) setTimeout(() => (window.location.href = '/login'), 1200);
  };

  return (
    <div className="space-y-3 max-w-md mx-auto">
      <h2 className="text-xl font-semibold">Nueva contraseña</h2>
      <input className="w-full border p-2 rounded" placeholder="Nueva contraseña"
             type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={update} className="px-3 py-2 border rounded">Actualizar</button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
