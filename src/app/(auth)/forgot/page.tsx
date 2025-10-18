'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

function ItSystemLogo({ size = 40 }: { size?: number }) {
  return (
    <div className="itlogo" style={{ '--s': `${size}px` } as React.CSSProperties}>
      <span className="itlogo-mark" aria-hidden />
      <span className="itlogo-text">IT-System</span>
    </div>
  );
}

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/update-password`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setLoading(false);
    if (error) {
      setErr(error.message || 'No se pudo enviar el correo de recuperación.');
      return;
    }
    setSent(true);
  }

  return (
    <main className="login-split">
      {/* Panel izquierdo */}
      <section className="split-left">
        <div className="brand-row right">
          <ItSystemLogo size={44} />
        </div>

        <div className="hero-copy right">
          <h1>Recuperar contraseña</h1>
          <p>Ingrese su correo y le enviaremos un enlace para restablecerla</p>
        </div>
      </section>

      <section className="split-right" aria-hidden />

      {/* Card centrada en la división */}
      <form className="login-card center-on-split" onSubmit={onSubmit}>
        {!sent ? (
          <>
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

            {err && <div className="form-error" role="alert">{err}</div>}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Enviando…' : 'ENVIAR ENLACE'}
            </button>

            <div className="minor-actions">
              <Link href="/login" className="link">← Volver al inicio de sesión</Link>
            </div>
          </>
        ) : (
          <div className="success-block" role="status" aria-live="polite">
            <div className="success-title">¡Correo enviado!</div>
            <p className="success-text">
              Si existe una cuenta asociada a <strong>{email}</strong>, recibirá un enlace para restablecer su contraseña.
            </p>
            <Link href="/login" className="btn-primary" style={{ textAlign: 'center' }}>
              Volver a iniciar sesión
            </Link>
          </div>
        )}
      </form>
    </main>
  );
}
