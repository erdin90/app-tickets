'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setLoading(false);
    if (error) return setErr(error.message || 'No se pudo iniciar sesión.');
    router.replace('/dashboard'); // ruta post-login
  }

  return (
    <main className="login-split">
      {/* Lado azul: marca + texto */}
      <section className="split-left">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden>🟦</div>
          <div className="brand-name">IT-System</div>
        </div>

        <div className="hero-copy">
          <h1>Iniciar sesión</h1>
          <p>Por favor ingrese las credenciales de su cuenta para continuar</p>
        </div>
      </section>

      {/* Card centrada sobre la línea de color (desktop) */}
      <section className="split-right" aria-hidden />

      <form className="login-card center-on-right" onSubmit={onSubmit}>
        <label className="field">
          <span className="label">Correo electrónico</span>
          <div className="input-wrap">
            <span className="leading" aria-hidden>✉️</span>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="correo@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </label>

        <label className="field">
          <span className="label">Contraseña</span>
          <div className="input-wrap">
            <span className="leading" aria-hidden>🔒</span>
            <input
              type={showPwd ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
            />
            <button
              type="button"
              className="trailing"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPwd ? 'Ocultar' : 'Mostrar'}
            >
              {showPwd ? '🙈' : '👁️'}
            </button>
          </div>
        </label>

        {err && <div className="form-error" role="alert">{err}</div>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Ingresando…' : 'INGRESAR'}
        </button>

        <div className="minor-actions">
          <Link href="/forgot" className="link">¿Olvidó su contraseña?</Link>
        </div>
      </form>
    </main>
  );
}
