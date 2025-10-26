'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function ItSystemLogo({ size = 40 }: { size?: number }) {
  return (
    <div className="itlogo" style={{ '--s': `${size}px` } as React.CSSProperties}>
      <span className="itlogo-mark" aria-hidden />
      <span className="itlogo-text">IT-System</span>
    </div>
  );
}

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  // Debe llegar desde el correo de recuperación con un session hash.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!alive) return;
      if (error || !user) {
        setErr('El enlace es inválido o ha expirado. Solicite uno nuevo.');
      } else {
        setEmail(user.email ?? null);
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  function validate(): string | null {
    if (pwd.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (pwd !== pwd2) return 'Las contraseñas no coinciden.';
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) { setErr(v); return; }
    setLoading(true);
    setErr(null);

    const { error } = await supabase.auth.updateUser({ password: pwd });

    if (error) {
      setLoading(false);
      setErr(error.message || 'No se pudo actualizar la contraseña.');
      return;
    }

    // Recomendado: cerrar sesión tras el cambio
    await supabase.auth.signOut();
    setLoading(false);
    setOk(true);
  }

  return (
    <main className="login-split">
      {/* Panel color izquierdo */}
      <section className="split-left">
        <div className="brand-row right">
          <ItSystemLogo size={44} />
        </div>

        <div className="hero-copy right">
          <h1>Nueva contraseña</h1>
          <p>Defina una nueva contraseña para su cuenta</p>
        </div>
      </section>

      <section className="split-right" aria-hidden />

      {/* Card centrada en la división */}
      <form className="login-card center-on-split" onSubmit={onSubmit}>
        {!ready ? (
          <div>Verificando enlace…</div>
        ) : ok ? (
          <div className="success-block" role="status" aria-live="polite">
            <div className="success-title">¡Contraseña actualizada!</div>
            <p className="success-text">
              Ya puede iniciar sesión con su nueva contraseña.
            </p>
            <Link href="/login" className="btn-primary" style={{ textAlign: 'center' }}>
              Ir a iniciar sesión
            </Link>
          </div>
        ) : err && !email ? (
          <>
            <div className="form-error" role="alert">{err}</div>
            <div className="minor-actions">
              <Link href="/forgot" className="link">Solicitar nuevo enlace</Link>
              <Link href="/login" className="link">Volver al login</Link>
            </div>
          </>
        ) : (
          <>
            {email && (
              <div className="meta" style={{ marginBottom: 4, color: '#6b7280', fontSize: 13 }}>
                Cuenta: <strong>{email}</strong>
              </div>
            )}

            <label className="field">
              <span className="label">Nueva contraseña</span>
              <div className="input-wrap">
                <span className="leading" aria-hidden>🔒</span>
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="trailing"
                  onClick={() => setShowPwd(v => !v)}
                  aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </label>

            <label className="field">
              <span className="label">Confirmar contraseña</span>
              <div className="input-wrap">
                <span className="leading" aria-hidden>✅</span>
                <input
                  type={showPwd2 ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repita la contraseña"
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="trailing"
                  onClick={() => setShowPwd2(v => !v)}
                  aria-label={showPwd2 ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPwd2 ? '🙈' : '👁️'}
                </button>
              </div>
            </label>

            {err && <div className="form-error" role="alert">{err}</div>}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Guardando…' : 'GUARDAR'}
            </button>

            <div className="minor-actions">
              <Link href="/login" className="link">← Volver al login</Link>
            </div>
          </>
        )}
      </form>
    </main>
  );
}
