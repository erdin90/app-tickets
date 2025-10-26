'use client';

import { useEffect, useState, Fragment, useRef, type CSSProperties } from 'react';
import { supabase } from '@/lib/supabase';
import { getMyProfile, type Profile } from '@/lib/users';
import { getManagerStats, getTechnicianStats, type ManagerStats, type TechnicianStats } from '@/lib/profileStats';
import { toast } from 'sonner';
import { useUI } from '@/providers/ui';
import AuthGuard from '@/components/AuthGuard';
import PageBar from '@/components/PageBar';
import AppModal from '@/components/AppModal';

// Simple inline SVG icons to avoid external icon font dependencies
function Icon({ name, size = 18, style }: { name: 'person' | 'email' | 'role' | 'dial' | 'lock' | 'edit'; size?: number; style?: CSSProperties }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, style } as const;
  switch (name) {
    case 'person':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.2 3.4-7.5 8-7.5s8 3.3 8 7.5" />
        </svg>
      );
    case 'email':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
      );
    case 'role':
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <circle cx="12" cy="9" r="2.5" />
          <path d="M8 16c1.2-1.6 2.6-2.4 4-2.4s2.8.8 4 2.4" />
        </svg>
      );
    case 'dial':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="1.5" /><circle cx="12" cy="7" r="1.5" /><circle cx="17" cy="7" r="1.5" />
          <circle cx="7" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="17" cy="12" r="1.5" />
          <circle cx="9.5" cy="17" r="1.5" /><circle cx="14.5" cy="17" r="1.5" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...common}>
          <path d="M4 16.2V20h3.8L18.6 9.2l-3.8-3.8L4 16.2z" />
          <path d="M13.9 5.4l3.8 3.8" />
        </svg>
      );
  }
}

function ProfileContent() {
  const { t } = useUI();
  // simple responsive hook
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [meEmail, setMeEmail] = useState<string>('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // edición
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [ext, setExt] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  // Password change modal (self-service)
  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // stats
  const [mStats, setMStats] = useState<ManagerStats | null>(null);
  const [tStats, setTStats] = useState<TechnicianStats | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [{ data: auth }, { data: me }] = await Promise.all([
          supabase.auth.getUser(),
          getMyProfile(),
        ]);

        setMeEmail(auth.user?.email ?? '');
    setProfile(me);
    setName(me?.full_name ?? '');
    setExt(me?.ext ?? '');
    setAvatarUrl(me?.avatar_url ?? '');

        if (me?.role === 'manager') {
          const ms = await getManagerStats();
          setMStats(ms);
        } else if (me?.id) {
          const ts = await getTechnicianStats(me.id);
          setTStats(ts);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e ?? 'Error');
        setErr(msg || (t('profile.error') as string));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  async function saveName() {
    if (!profile?.id) return;
    setSaving(true);
    const cleanedExt = ext.trim() || null;
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name, ext: cleanedExt, avatar_url: avatarUrl.trim() || null })
      .eq('id', profile.id);
    setSaving(false);
    if (error) {
      toast.error(error.message || String(t('profile.error')));
      return;
    }
    setProfile({ ...profile, full_name: name, ext: cleanedExt, avatar_url: avatarUrl.trim() || null });
    // Notificar a otras vistas (sidebar) que el perfil cambió
    try {
      const bc = new BroadcastChannel('profile');
      bc.postMessage({ type: 'updated', data: { full_name: name, ext: cleanedExt, avatar_url: avatarUrl.trim() || null } });
      bc.close();
    } catch {}
    toast.success('Datos guardados');
    setEditingInfo(false);
  }

  async function changeMyPassword() {
  if (!curPw || !newPw || !newPw2) { toast.error('Completa todos los campos'); return; }
  if (newPw.length < 8) { toast.error('La nueva contraseña debe tener al menos 8 caracteres'); return; }
  if (newPw !== newPw2) { toast.error('Las contraseñas no coinciden'); return; }
    setPwSaving(true);
    try {
      // Reautenticación con correo + contraseña actual
      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email ?? '';
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: curPw });
      if (signInErr) throw signInErr;

      // Actualizar contraseña del usuario actual
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setPwOpen(false);
      setCurPw(''); setNewPw(''); setNewPw2('');
      toast.success('Contraseña actualizada');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? 'Error');
      toast.error(msg || 'No se pudo actualizar la contraseña');
    } finally {
      setPwSaving(false);
    }
  }

  // Rol legible (sólo 3: user | it | manager)
  const roleLabel = (() => {
    const r = (profile?.role || '').toLowerCase();
    // Helper: if translation key is missing and t() returns the key itself, fallback to the readable default
    const tr = (key: string, fallback: string) => {
      const val = (t(key) as string) ?? '';
      return val && val !== key ? val : fallback;
    };
    if (r === 'manager' || r === 'admin') return tr('role.manager', 'Manager');
    if (r === 'it' || r === 'technician') return tr('role.technician', 'IT');
    if (r === 'user' || r === 'client') return tr('role.user', 'User');
    return undefined;
  })();

  // habilita "Guardar" solo si hay cambios (nombre o extensión)
  const dirtyName = name.trim() !== (profile?.full_name ?? '').trim();
  const dirtyExt = ext.trim() !== (profile?.ext ?? '').trim();
  const dirtyAvatar = (avatarUrl.trim() || '') !== (profile?.avatar_url || '');
  const dirty = dirtyName || dirtyExt || dirtyAvatar;

  const i = (k: string, m: Record<string, string | number>) => {
    let s = t(k) as string;
    Object.entries(m).forEach(([key, val]) => {
      s = s.replace(`{${key}}`, String(val));
    });
    return s;
  };

  // ——— BARRA SUPERIOR ———
  const Bar = (
    <PageBar
      title={t('profile.title') as string}
      subtitle={roleLabel}
      right={
        <>
          <button className="btn" onClick={() => history.back()}>Volver</button>
        </>
      }
    />
  );

  if (loading) {
    return (
      <>
        {Bar}
        <div className="container">
          <div className="meta">{t('profile.loading')}</div>
        </div>
      </>
    );
  }

  if (err) {
    return (
      <>
        {Bar}
        <div className="container">
          <div className="ticket" style={{ color: 'var(--danger)' }}>{err}</div>
        </div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        {Bar}
        <div className="container">
          <div className="ticket">—</div>
        </div>
      </>
    );
  }

  return (
    <>
      {Bar}

      <div className="container" style={{ display: 'grid', gap: 16 }}>
        {/* Hero */}
        <div className="ticket" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: '#eef2ff', display: 'grid', placeItems: 'center', fontWeight: 700, color: '#1f2937' }}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={name || meEmail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 24 }}>{(name || meEmail || 'U').slice(0,1).toUpperCase()}</span>
              )}
            </div>
            <div>
              <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 800 }}>{name || meEmail}</div>
              <div className="meta" style={{ marginTop: 2 }}>{roleLabel}</div>
            </div>
          </div>
          <div style={{ justifySelf: isMobile ? 'end' : 'auto', display:'flex', gap:8, alignItems:'center' }}>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f || !profile?.id) return;
              if (f.size > 2 * 1024 * 1024) { toast.error('Máximo 2MB'); e.currentTarget.value=''; return; }
              try {
                setUploading(true);
                const ext = f.name.split('.').pop()?.toLowerCase() || 'jpg';
                const path = `${profile.id}/${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('avatars').upload(path, f, { upsert: true, contentType: f.type });
                if (upErr) throw upErr;
                const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
                const url = pub.publicUrl;
                const { error: updErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
                if (updErr) throw updErr;
                setProfile({ ...profile, avatar_url: url });
                try {
                  const bc = new BroadcastChannel('profile');
                  bc.postMessage({ type: 'updated', data: { avatar_url: url } });
                  bc.close();
                } catch {}
                toast.success('Avatar actualizado');
              } catch (e: any) {
                toast.error(e?.message || 'No se pudo subir el avatar');
              } finally {
                setUploading(false);
                if (fileRef.current) fileRef.current.value = '';
              }
            }} />
            <button className="btn" onClick={() => fileRef.current?.click()} style={{ height: 36, padding: '0 10px', display:'inline-flex', alignItems:'center' }} disabled={uploading} title="Cambiar avatar">
              {uploading ? 'Cargando…' : 'Cambiar avatar'}
            </button>
            <button className="btn" onClick={() => setPwOpen(true)} title="Cambiar contraseña" style={{ height: 36, padding: '0 10px', display:'inline-flex', alignItems:'center' }}>
              <Icon name="lock" size={18} />
            </button>
          </div>
        </div>

        {/* Metrics row */}
  {(profile.role === 'technician' || profile.role === 'it') && tStats && (
          <div className="grid" style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="ticket">
              <div className="meta">Resueltos (total)</div>
              <div className="title" style={{ fontSize: isMobile ? 22 : 26 }}>{tStats.completedAll}</div>
            </div>
            <div className="ticket">
              <div className="meta">Resueltos (30 días)</div>
              <div className="title" style={{ fontSize: isMobile ? 22 : 26 }}>{tStats.completed30d}</div>
            </div>
            <div className="ticket">
              <div className="meta">Promedio de resolución</div>
              <div className="title" style={{ fontSize: isMobile ? 20 : 22 }}>{tStats.avgResolutionHours ? `${tStats.avgResolutionHours.toFixed(1)} h` : '—'}</div>
            </div>
          </div>
        )}

        {/* Two columns: left activity/history, right info */}
  <div className="grid" style={{ gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16 }}>
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Actividad reciente */}
            {(profile.role === 'technician' || profile.role === 'it') && tStats && (
              <div className="ticket" style={{ display: 'grid', gap: 10 }}>
                <div className="section-title" style={{ margin: 0 }}>Actividad reciente</div>
                {tStats.lastTickets.length === 0 ? (
                  <div className="meta">No hay actividad reciente</div>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: '1fr 120px 160px', gap: 8 }}>
                    {tStats.lastTickets.slice(0, 5).map((tt) => {
                      const createdDate = new Date(tt.created_at);
                      const today = new Date();
                      today.setHours(0,0,0,0);
                      const isCompleted = tt.status === 'completed';
                      const isOverdue = !isCompleted && tt.due_date ? new Date(tt.due_date) < new Date() : false;
                      const isNew = !isCompleted && createdDate >= today;
                      const category = isCompleted ? 'completed' : isOverdue ? 'overdue' : isNew ? 'new' : 'pending';
                      const label = category === 'completed' ? 'Completado' : category === 'overdue' ? 'Vencido' : category === 'new' ? 'Nuevo' : 'Pendiente';
                      const badgeCls = `badge ${category === 'completed' ? 'badge-closed' : category === 'new' ? 'badge-open' : category === 'overdue' ? 'badge-overdue' : 'badge-pending'}`;
                      return (
                        <Fragment key={tt.id}>
                          <div>
                            <a href={`/tickets/${tt.id}`} style={{ textDecoration: 'none' }}>{tt.title}</a>
                          </div>
                          <div className="trow-badges"><span className={badgeCls}>{label}</span></div>
                          <div className="meta">{tt.completed_at ? new Date(tt.completed_at).toLocaleString() : '—'}</div>
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Historial de tickets */}
            {(profile.role === 'technician' || profile.role === 'it') && tStats && (
              <div className="ticket" style={{ display: 'grid', gap: 10 }}>
                <div className="section-title" style={{ margin: 0 }}>Historial de tickets</div>
                {tStats.lastTickets.length === 0 ? (
                  <div className="meta">Sin registros</div>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: '1fr 140px 160px', gap: 8 }}>
                    <div className="meta" style={{ fontWeight: 600 }}>Asunto</div>
                    <div className="meta" style={{ fontWeight: 600 }}>Estado</div>
                    <div className="meta" style={{ fontWeight: 600 }}>Fecha</div>
                    {tStats.lastTickets.map((tt) => {
                      const createdDate = new Date(tt.created_at);
                      const today = new Date();
                      today.setHours(0,0,0,0);
                      const isCompleted = tt.status === 'completed';
                      const isOverdue = !isCompleted && tt.due_date ? new Date(tt.due_date) < new Date() : false;
                      const isNew = !isCompleted && createdDate >= today;
                      const category = isCompleted ? 'completed' : isOverdue ? 'overdue' : isNew ? 'new' : 'pending';
                      const label = category === 'completed' ? 'Completado' : category === 'overdue' ? 'Vencido' : category === 'new' ? 'Nuevo' : 'Pendiente';
                      const badgeCls = `badge ${category === 'completed' ? 'badge-closed' : category === 'new' ? 'badge-open' : category === 'overdue' ? 'badge-overdue' : 'badge-pending'}`;
                      const dateText = tt.completed_at ? new Date(tt.completed_at).toLocaleDateString() : new Date(tt.created_at).toLocaleDateString();
                      return (
                        <Fragment key={tt.id}>
                          <div>
                            <a href={`/tickets/${tt.id}`} style={{ textDecoration: 'none' }}>{tt.title}</a>
                          </div>
                          <div className="trow-badges"><span className={badgeCls}>{label}</span></div>
                          <div className="meta">{dateText}</div>
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Información (editable) */}
          <div>
            <div className="ticket" style={{ display: 'grid', gap: 14 }}>
              <div className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Información</span>
                {!editingInfo ? (
                  <button className="btn" onClick={() => setEditingInfo(true)} style={{ height: 28, padding: '0 8px', display:'inline-flex', alignItems:'center' }} title="Editar">
                    <Icon name="edit" size={16} />
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => { setName(profile.full_name ?? ''); setExt(profile.ext ?? ''); setAvatarUrl(profile.avatar_url ?? ''); setEditingInfo(false); }} style={{ height: 28, padding: '0 10px', fontSize: 12 }}>Cancelar</button>
                    <button className="btn btn-primary" onClick={saveName} disabled={!dirty || saving} style={{ height: 28, padding: '0 10px', fontSize: 12 }}>{saving ? 'Guardando…' : 'Guardar'}</button>
                  </div>
                )}
              </div>

              {/* Icon rows */}
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, alignItems: 'center' }}>
                  <Icon name="person" size={18} style={{ color: 'var(--muted)' }} />
                  {!editingInfo ? (
                    <div className="input" style={{ paddingTop: 10, paddingBottom: 10 }}>{name || '—'}</div>
                  ) : (
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, alignItems: 'center' }}>
                  <Icon name="email" size={18} style={{ color: 'var(--muted)' }} />
                  <div className="input" style={{ paddingTop: 10, paddingBottom: 10 }}>{meEmail}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, alignItems: 'center' }}>
                  <Icon name="role" size={18} style={{ color: 'var(--muted)' }} />
                  <div className="input" style={{ paddingTop: 10, paddingBottom: 10 }}>{roleLabel}</div>
                </div>
                {/* Avatar URL manual */}
                <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, alignItems: 'center' }}>
                  <Icon name="person" size={18} style={{ color: 'var(--muted)' }} />
                  {!editingInfo ? (
                    <div className="input" style={{ paddingTop: 10, paddingBottom: 10, overflow:'hidden', textOverflow:'ellipsis' }} title={avatarUrl || '—'}>
                      {avatarUrl || '—'}
                    </div>
                  ) : (
                    <input className="input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, alignItems: 'center' }}>
                  <Icon name="dial" size={18} style={{ color: 'var(--muted)' }} />
                  {!editingInfo ? (
                    <div className="input" style={{ paddingTop: 10, paddingBottom: 10 }}>{ext || '—'}</div>
                  ) : (
                    <input className="input" value={ext} onChange={(e) => setExt(e.target.value)} placeholder="Extensión" />
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, alignItems: 'center' }}>
                  <Icon name="lock" size={18} style={{ color: 'var(--muted)' }} />
                  <button className="btn" onClick={() => setPwOpen(true)} style={{ height: 32, padding: '0 12px', fontSize: 12 }}>Cambiar contraseña</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Estadísticas según rol */}
  {profile.role === 'manager' && mStats && (
          <>
            <div
              className="grid"
              style={{
                gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
                gap: 12,
              }}
            >
              <div className="ticket">
                <div className="meta">{t('profile.managerStats.total')}</div>
                <div className="title" style={{ fontSize: 28 }}>
                  {mStats.total}
                </div>
              </div>
              <div className="ticket">
                <div className="meta">{t('profile.managerStats.active')}</div>
                <div className="title" style={{ fontSize: 28 }}>
                  {mStats.open}
                </div>
              </div>
              <div className="ticket">
                <div className="meta">{t('profile.managerStats.completed')}</div>
                <div className="title" style={{ fontSize: 28 }}>
                  {mStats.completed}
                </div>
              </div>
              <div className="ticket">
                <div className="meta">{t('profile.managerStats.overdue')}</div>
                <div className="title" style={{ fontSize: 28, color: 'var(--danger)' }}>
                  {mStats.overdue}
                </div>
              </div>
            </div>

            <div className="ticket" style={{ display: 'grid', gap: 10 }}>
              <div className="section-title" style={{ margin: 0 }}>
                {t('profile.managerStats.topTechs')}
              </div>
              {mStats.topTechs30d.length === 0 ? (
                <div className="meta">{t('profile.managerStats.noData')}</div>
              ) : (
                <div className="grid" style={{ gridTemplateColumns: '1fr 120px', gap: 10 }}>
                  {mStats.topTechs30d.map((tt) => (
                    <div key={tt.id} className="ticket" style={{ display: 'contents' }}>
                      <div style={{ padding: '6px 8px' }}>{tt.name}</div>
                      <div style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800 }}>
                        {tt.completed}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {(profile.role === 'technician' || profile.role === 'it') && tStats && (
          <>
            <div
              className="grid"
              style={{
                gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
                gap: 12,
              }}
            >
              <div className="ticket">
                <div className="meta">{t('profile.techStats.completedAll')}</div>
                <div className="title" style={{ fontSize: 28 }}>{tStats.completedAll}</div>
              </div>
              <div className="ticket">
                <div className="meta">{t('profile.techStats.completed30d')}</div>
                <div className="title" style={{ fontSize: 28 }}>{tStats.completed30d}</div>
              </div>
              <div className="ticket">
                <div className="meta">{t('profile.techStats.openAssigned')}</div>
                <div className="title" style={{ fontSize: 28 }}>{tStats.openAssigned}</div>
              </div>
              <div className="ticket">
                <div className="meta">{t('profile.techStats.overdueAssigned')}</div>
                <div className="title" style={{ fontSize: 28, color: 'var(--danger)' }}>
                  {tStats.overdueAssigned}
                </div>
              </div>
              <div className="ticket">
                <div className="meta">{t('profile.techStats.avgResolution')}</div>
                <div className="title" style={{ fontSize: 24 }}>
                  {tStats.avgResolutionHours ? `${tStats.avgResolutionHours.toFixed(1)} h` : '—'}
                </div>
              </div>
            </div>

            <div className="ticket" style={{ display: 'grid', gap: 10 }}>
              <div className="section-title" style={{ margin: 0 }}>
                {t('profile.techStats.lastTickets')}
              </div>
              {tStats.lastTickets.length === 0 ? (
                <div className="meta">{t('profile.techStats.none')}</div>
              ) : (
                <div className="grid" style={{ gridTemplateColumns: '1fr 160px 180px', gap: 8 }}>
                  {tStats.lastTickets.map((tt) => {
                    const createdDate = new Date(tt.created_at);
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const isCompleted = tt.status === 'completed';
                    const isOverdue = !isCompleted && tt.due_date ? new Date(tt.due_date) < new Date() : false;
                    const isNew = !isCompleted && createdDate >= today; // creado hoy
                    const category = isCompleted ? 'completed' : isOverdue ? 'overdue' : isNew ? 'new' : 'pending';
                    const label = category === 'completed' ? 'Completado' : category === 'overdue' ? 'Vencido' : category === 'new' ? 'Nuevo' : 'Pendiente';
                    const badgeCls = `badge ${category === 'completed' ? 'badge-closed' : category === 'new' ? 'badge-open' : category === 'overdue' ? 'badge-overdue' : 'badge-pending'}`;
                    return (
                      <Fragment key={tt.id}>
                        <div>
                          <a href={`/tickets/${tt.id}`} style={{ textDecoration: 'none' }}>
                            {tt.title}
                          </a>
                        </div>
                        <div className="trow-badges">
                          <span className={badgeCls}>{label}</span>
                        </div>
                        <div className="meta">
                          {tt.completed_at ? new Date(tt.completed_at).toLocaleString() : '—'}
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recomendaciones */}
            <div className="ticket" style={{ display: 'grid', gap: 6 }}>
              <div className="section-title" style={{ margin: 0 }}>
                {t('profile.techStats.recommendations')}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {tStats.overdueAssigned > 0 && (
                  <li>{i('profile.reco.overdue', { count: tStats.overdueAssigned })}</li>
                )}
                {tStats.openAssigned > 8 && <li>{t('profile.reco.tooManyOpen')}</li>}
                {tStats.overdueAssigned === 0 && tStats.openAssigned <= 8 && (
                  <li>{t('profile.reco.good')}</li>
                )}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Modal de cambio de contraseña (self-service) */}
      <AppModal
        open={pwOpen}
        title="Cambiar contraseña"
        variant="info"
        onClose={() => setPwOpen(false)}
        primary={{ label: pwSaving ? 'Guardando…' : 'Guardar', onClick: changeMyPassword }}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            Contraseña actual
            <input className="input" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Nueva contraseña
            <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} minLength={8} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Confirmar nueva contraseña
            <input className="input" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} minLength={8} />
          </label>
          <div className="meta">Mínimo 8 caracteres.</div>
        </div>
      </AppModal>
    </>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}
