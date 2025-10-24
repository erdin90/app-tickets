'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { supabase } from '@/lib/supabase';
import { getMyProfile } from '@/lib/users';
import PageBar from '@/components/PageBar';
import AppModal from '@/components/AppModal';
import Link from 'next/link';
import Avatar from '@/components/ui/Avatar';
import { toast } from 'sonner';

type ManagedUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  ext?: string | null;
  can_create_ticket?: boolean | null;
  status: 'active' | 'disabled';
  last_sign_in_at: string | null;
  created_at: string | null;
};

type FormMode = 'create' | 'edit';

type FormState = {
  id: string;
  email: string;
  password: string;
  full_name: string;
  avatar_url: string;
  role: 'manager' | 'it' | 'user';
  ext?: string;
  can_create_ticket: boolean;
};

const EMPTY_FORM: FormState = {
  id: '',
  email: '',
  password: '',
  full_name: '',
  avatar_url: '',
  role: 'it',
  ext: '',
  can_create_ticket: true,
};

/* ===== Hook responsive muy simple ===== */
function useIsNarrow(breakpoint = 900) {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isNarrow;
}

async function authFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sesión no encontrada');

  const headers = new Headers(options?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!(options?.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error ?? 'Error desconocido');
  return payload as T;
}

function ProfilesContent() {
  const isMobile = useIsNarrow(900);
  const formRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const [formHighlight, setFormHighlight] = useState(false);

  const [initializing, setInitializing] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Snapshot para comparar cambios y deshabilitar el botón de actualizar hasta que haya modificaciones
  const [originalForm, setOriginalForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [manager, setManager] = useState<boolean | null>(null);
  // Password modal state (admin changes other user's password)
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState<{ id: string; name: string } | null>(null);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const roleLabel = (r: string | null) => {
    const v = (r || '').toLowerCase();
    if (v === 'manager' || v === 'admin') return 'Manager / Admin';
    if (v === 'it' || v === 'technician') return 'IT';
    if (v === 'user' || v === 'client') return 'Usuario';
    return v || 'Sin rol';
  };

  const loadUsers = useCallback(async () => {
    try {
      setListLoading(true);
      const data = await authFetch<{ users: ManagedUser[] }>('/api/admin/users');
      setUsers(data.users);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Error');
      setError(msg || 'No se pudo cargar la información.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await getMyProfile();
      setManager(data?.role === 'manager');
      if (data?.role === 'manager') await loadUsers();
      setInitializing(false);
    })().catch((err) => {
      console.error(err);
      setError('No se pudo cargar la información.');
      setInitializing(false);
    });
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const term = search.toLowerCase();
    return users.filter((user) => {
      const haystack = [user.full_name, user.email, user.id].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [users, search]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setFormMode('create');
    setOriginalForm(null);
  }

  function onEdit(user: ManagedUser) {
    const r = (user.role || '').toLowerCase();
    const normalized: FormState['role'] = (r === 'manager' || r === 'admin') ? 'manager' : (r === 'user' || r === 'client' ? 'user' : 'it');
    const next: FormState = {
      id: user.id,
      email: user.email ?? '',
      password: '',
      full_name: user.full_name ?? '',
      avatar_url: user.avatar_url ?? '',
      role: normalized,
      ext: (user as any).ext ?? '',
      can_create_ticket: (user as any).can_create_ticket ?? true,
    };
    setForm(next);
    setOriginalForm(next);
    setFormMode('edit');
    // Llevar el foco al formulario y resaltarlo brevemente
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      emailRef.current?.focus();
      setFormHighlight(true);
      setTimeout(() => setFormHighlight(false), 1200);
    }, 0);
  }

  // Determina si el formulario fue modificado respecto al snapshot original (solo en modo edición)
  const isDirty = useMemo(() => {
    if (formMode !== 'edit' || !originalForm) return false;
    return (
      originalForm.email !== form.email ||
      originalForm.full_name !== form.full_name ||
      originalForm.avatar_url !== form.avatar_url ||
      originalForm.role !== form.role ||
      (originalForm.ext || '') !== (form.ext || '') ||
      !!originalForm.can_create_ticket !== !!form.can_create_ticket
    );
  }, [formMode, originalForm, form.email, form.full_name, form.avatar_url, form.role, form.ext, form.can_create_ticket]);

  // Validación mínima para el modo "create": email válido y contraseña >= 8
  const isCreateReady = useMemo(() => {
    if (formMode !== 'create') return false;
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim());
    const passOk = (form.password || '').length >= 8;
    return emailOk && passOk;
  }, [formMode, form.email, form.password]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (formMode === 'create' && (!form.email || !form.password)) {
      toast.error('Email y contraseña son obligatorios');
      return;
    }

    try {
      setSaving(true);
      if (formMode === 'create') {
        await authFetch('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            full_name: form.full_name || null,
            avatar_url: form.avatar_url || null,
            role: form.role,
            ext: form.ext || null,
            can_create_ticket: !!form.can_create_ticket,
          }),
        });
      } else {
        await authFetch(`/api/admin/users/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            email: form.email || null,
            full_name: form.full_name || null,
            avatar_url: form.avatar_url || null,
            role: form.role,
            ext: form.ext || null,
            can_create_ticket: !!form.can_create_ticket,
          }),
        });
      }
      await loadUsers();
      resetForm();
      toast.success(formMode === 'create' ? 'Perfil creado' : 'Perfil actualizado');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Error');
      toast.error(msg || 'No se pudo guardar el perfil');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(user: ManagedUser) {
    if (!confirm(`¿Eliminar el usuario ${user.email ?? user.full_name ?? user.id}?`)) return;
    try {
      await authFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      await loadUsers();
      if (form.id === user.id) resetForm();
      toast.success('Usuario eliminado');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Error');
      toast.error(msg || 'No se pudo eliminar');
    }
  }

  async function onToggleStatus(user: ManagedUser) {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      let reason: string | undefined;
      let contact: string | undefined;
      if (nextStatus === 'disabled') {
        const r = prompt('Motivo de desactivación (visible para el usuario):', 'Tu cuenta ha sido desactivada temporalmente.');
        const c = prompt('Contacto del administrador (email/teléfono):', 'it@empresa.com');
        reason = r ?? undefined;
        contact = c ?? undefined;
      }
      await authFetch(`/api/admin/users/${user.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus, reason: reason || null, contact: contact || null }),
      });
      await loadUsers();
      toast.success(nextStatus === 'disabled' ? 'Usuario desactivado' : 'Usuario reactivado');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Error');
      toast.error(msg || 'No se pudo actualizar el estado');
    }
  }

  function onChangePassword(user: ManagedUser) {
    setPwUser({ id: user.id, name: user.full_name || user.email || user.id });
    setPw1(''); setPw2(''); setPwOpen(true);
  }

  async function submitPasswordChange() {
    if (!pwUser) return;
  if (!pw1 || pw1.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return; }
  if (pw1 !== pw2) { toast.error('Las contraseñas no coinciden'); return; }
    setPwSaving(true);
    try {
      await authFetch(`/api/admin/users/${pwUser.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: pw1 }),
      });
      setPwOpen(false);
      toast.success('Contraseña actualizada');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Error');
      toast.error(msg || 'No se pudo actualizar la contraseña');
    } finally {
      setPwSaving(false);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('UUID copiado');
    } catch {
      toast.info(value);
    }
  }

  if (initializing) {
    return <div className="container"><div className="meta">Cargando…</div></div>;
  }

  if (manager === false) {
    return (
      <div className="container">
        <div className="ticket">
          <div className="section-title" style={{ margin: 0 }}>Perfiles</div>
          <p>Solo los managers pueden gestionar perfiles.</p>
          <div style={{ marginTop: 8 }}>
            <Link className="btn" href="/dashboard">Volver al dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ===== Banner superior ===== */}
      <PageBar
        title="Perfiles"
        subtitle="Gestión de usuarios"
        right={
          !isMobile && (
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <input
                className="input"
                placeholder="Buscar…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 260, height: 32, fontSize: 12 }}
                aria-label="Buscar perfiles"
              />
              <button
                className="btn"
                onClick={loadUsers}
                disabled={listLoading}
                style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                title="Actualizar lista"
              >
                {listLoading ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>
          )
        }
      />

      {/* Barra de búsqueda compacta SOLO móvil */}
      {isMobile && (
        <div className="container" style={{ paddingTop: 8 }}>
          <div className="ticket" style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input
              className="input"
              placeholder="Buscar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ height: 34, fontSize: 13, flex: 1 }}
            />
            <button
              className="btn"
              onClick={loadUsers}
              disabled={listLoading}
              style={{ height: 34, padding: '0 12px', fontSize: 12, whiteSpace:'nowrap' }}
            >
              {listLoading ? '…' : 'Actualizar'}
            </button>
          </div>
        </div>
      )}

  <div className="container" style={{ display: 'grid', gap: 18 }}>
        {error && (
          <div className="ticket" style={{ color: 'var(--danger)' }}>{error}</div>
        )}

        {/* Split: Lista (izquierda) | Detalle/Form (derecha) */}
        <div
          className="grid"
          style={{
            // Layout 70% (lista) / 30% (form)
            gridTemplateColumns: isMobile ? '1fr' : '70% 30%',
            gap: 18,
            alignItems: 'start'
          }}
        >
          {/* Listado - izquierda */}
          <div className="ticket" style={{ display: 'grid', gap: 12, paddingTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
              <div>
                <div className="section-title" style={{ margin: 0 }}>Perfiles existentes</div>
                <div className="meta">Busca por nombre o correo.</div>
              </div>
              {/* En desktop el buscador está en el PageBar; en mobile ya lo mostramos arriba */}
            </div>

            {listLoading && <div className="meta">Actualizando lista…</div>}

            {/* Tabla en desktop, lista simple en móvil */}
            {!isMobile ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', fontSize: 13, color: '#6b7280' }}>
                      <th style={{ padding: '10px 12px', width: 56, minWidth: 56 }}>Avatar</th>
                      <th style={{ padding: '10px 12px' }}>Nombre</th>
                      <th style={{ padding: '10px 12px' }}>Email</th>
                      <th style={{ padding: '10px 12px' }}>Rol</th>
                      <th style={{ padding: '10px 12px' }}>Estado</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 12 }} className="meta">No hay perfiles.</td></tr>
                    )}
                    {filteredUsers.map((user) => (
                      <tr key={user.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <Avatar src={user.avatar_url} alt={user.full_name || user.email || ''} seed={user.id || user.email || undefined} size={35} radius={10} />
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{user.full_name || '—'}</td>
                        <td style={{ padding: '10px 12px', color: '#334155' }}>{user.email || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>{roleLabel(user.role)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            className="badge"
                            style={{
                              background: user.status === 'active' ? 'rgba(22,163,74,.18)' : 'rgba(220,38,38,.18)',
                              color: user.status === 'active' ? '#166534' : '#991b1b',
                              borderColor: user.status === 'active' ? '#86efac' : '#fecaca'
                            }}
                          >
                            {user.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button className="btn" onClick={() => onEdit(user)} style={{ height: 30, padding: '0 12px', fontSize: 12 }}>Editar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid" style={{ gap: 10 }}>
                {filteredUsers.length === 0 && (
                  <div className="meta">No hay perfiles.</div>
                )}
                {filteredUsers.map((user) => (
                  <div key={user.id} className="ticket" style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar src={user.avatar_url} alt={user.full_name || user.email || ''} seed={user.id || user.email || undefined} size={30} />
                      <div>
                        <div className="title">{user.full_name || '—'}</div>
                        <div className="meta">{user.email || '—'}</div>
                      </div>
                      <div style={{ marginLeft: 'auto' }}>
                        <span
                          className="badge"
                          style={{
                            background: user.status === 'active' ? 'rgba(22,163,74,.18)' : 'rgba(220,38,38,.18)',
                            color: user.status === 'active' ? '#166534' : '#991b1b',
                            borderColor: user.status === 'active' ? '#86efac' : '#fecaca'
                          }}
                        >
                          {user.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <div className="meta">Rol: {roleLabel(user.role)}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn" onClick={() => onEdit(user)} style={{ height: 30, padding: '0 12px', fontSize: 12 }}>Editar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formulario - derecha: compacto y bicolor */}
          <div
            ref={formRef}
            className="ticket"
            style={{
              display: 'grid',
              gap: 12,
              paddingTop: 16,
              boxShadow: formHighlight ? '0 0 0 3px rgba(59,130,246,.25)' : undefined,
              transition: 'box-shadow .3s ease'
            }}
          >
            <div className="section-title" style={{ margin: 0 }}>
              {formMode === 'create' ? 'Agregar perfil' : 'Editar perfil'}
            </div>

            {/* Campo select estilizado para rol */}
            <form
              onSubmit={handleSubmit}
              style={{
                display: 'grid',
                gap: 10,
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                alignItems: 'end'
              }}
            >
              {/* UUID oculto en UI de edición para simplificar */}

              <label style={{ display: 'grid', gap: 6 }}>
                <span className="meta">Correo electrónico</span>
                <input
                  className="input"
                  ref={emailRef}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="usuario@empresa.com"
                  required={formMode === 'create'}
                  style={{ height: 36, fontSize: 13 }}
                />
              </label>

              {formMode === 'create' ? (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="meta">Contraseña temporal</span>
                  <input
                    className="input"
                    type="password"
                    value={form.password}
                    minLength={8}
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="••••••••"
                    required
                    style={{ height: 36, fontSize: 13 }}
                  />
                </label>
              ) : (
                <div />
              )}

              <label style={{ display: 'grid', gap: 6 }}>
                <span className="meta">Nombre completo</span>
                <input
                  className="input"
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Nombre Apellido"
                  style={{ height: 36, fontSize: 13 }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span className="meta">Rol</span>
                <div style={{ position: 'relative' }}>
                  {/** valor defensivo para evitar un select "en blanco" si llega un rol fuera de lo permitido */}
                  {(() => null)()}
                  <select
                    className="input"
                    value={(form.role === 'manager' || form.role === 'it' || form.role === 'user') ? form.role : 'it'}
                    onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as FormState['role'] }))}
                    style={{
                      height: 38,
                      fontSize: 13,
                      paddingRight: 28,
                      WebkitAppearance: 'none' as any,
                      MozAppearance: 'none' as any,
                      appearance: 'none',
                      lineHeight: '36px'
                    }}
                  >
                    {/* Opción segura para evitar ver vacío si hay un valor desconocido */}
                    {!(form.role === 'manager' || form.role === 'it' || form.role === 'user') && (
                      <option value="it">IT / Técnico</option>
                    )}
                    <option value="it">IT / Técnico</option>
                    <option value="manager">Manager / Admin</option>
                    <option value="user">Usuario</option>
                  </select>
                  <span
                    aria-hidden="true"
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: .6 }}
                  >▾</span>
                </div>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span className="meta">URL de avatar (opcional)</span>
                <input
                  className="input"
                  type="url"
                  value={form.avatar_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, avatar_url: e.target.value }))}
                  placeholder="https://…"
                  style={{ height: 36, fontSize: 13 }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span className="meta">Extensión telefónica</span>
                <input
                  className="input"
                  type="text"
                  value={form.ext}
                  onChange={(e) => setForm((prev) => ({ ...prev, ext: e.target.value }))}
                  placeholder="1234"
                  style={{ height: 36, fontSize: 13 }}
                />
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: isMobile ? '1 / -1' : '2', justifySelf: 'end', marginTop: 6 }}>
                <input
                  id="canCreateTicket"
                  type="checkbox"
                  checked={form.can_create_ticket}
                  onChange={(e) => setForm(prev => ({ ...prev, can_create_ticket: e.target.checked }))}
                />
                <label htmlFor="canCreateTicket" className="meta">Puede crear tickets</label>
              </div>

              {/* Modal para cambiar contraseña (admin) */}
              <AppModal
                open={pwOpen}
                title={`Cambiar contraseña${pwUser ? ` — ${pwUser.name}` : ''}`}
                variant="info"
                onClose={() => setPwOpen(false)}
                primary={{ label: pwSaving ? 'Guardando…' : 'Guardar', onClick: submitPasswordChange }}
              >
                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    Nueva contraseña
                    <input className="input" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} minLength={8} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    Confirmar nueva contraseña
                    <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} />
                  </label>
                  <div className="meta">Mínimo 8 caracteres.</div>
                </div>
              </AppModal>

              <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems:'center', flexWrap:'wrap', marginTop: 6 }}>
                {formMode === 'edit' && (
                  <button type="button" className="btn" onClick={resetForm} disabled={saving}>
                    Cancelar
                  </button>
                )}
                {/** Botón principal: deshabilitado si guardando, si en edición y no hay cambios, o si en creación y faltan requisitos */}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || (formMode === 'edit' && !isDirty) || (formMode === 'create' && !isCreateReady)}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    fontSize: 13,
                    width: 'auto',
                    alignSelf:'end',
                    opacity: (formMode === 'edit' && !isDirty) || (formMode === 'create' && !isCreateReady) ? .6 : undefined,
                    cursor: (formMode === 'edit' && !isDirty) || (formMode === 'create' && !isCreateReady) ? 'not-allowed' : undefined
                  }}
                >
                  {saving ? 'Guardando…' : formMode === 'create' ? 'Crear perfil' : 'Actualizar perfil'}
                </button>
              </div>
            </form>
          </div>

          </div>
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <Link className="btn" href="/dashboard">Volver al dashboard</Link>
          </div>
        </div>
    </>
  );
}

export default function ProfilesPage() {
  return (
    <AuthGuard>
      <ProfilesContent />
    </AuthGuard>
  );
}
