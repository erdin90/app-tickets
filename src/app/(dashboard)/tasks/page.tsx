'use client';

import { useEffect, useMemo, useState } from 'react';
import PageBar from '@/components/PageBar';
import { useProfile } from '@/lib/useProfile';
import { DEFAULT_TASKS, formatDate, getChecksForUser, getManagerDailyMatrix, getWeeklyMatrix, isBusinessDay, mondayOfWeek, addDays, resolveDefaultTasksWithUserIds, toggleCheck, setTaskSettings, getTaskSettings, upsertTaskDef, deleteTaskDef, validateTaskTitle } from '@/lib/tasks';
import { listTechnicians } from '@/lib/users';
import { supabase } from '@/lib/supabase';
import AppModal from '@/components/AppModal';

export default function TasksPage() {
  const { profile, userId, loading: loadingProfile } = useProfile();
  const [date, setDate] = useState(formatDate());
  const isManager = (profile?.role ?? '').toLowerCase() === 'manager' || (profile?.role ?? '').toLowerCase() === 'admin';

  const Bar = (
    <PageBar
      title="Tareas"
      subtitle={isManager ? 'Seguimiento diario del equipo' : 'Checklist diario'}
      right={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="input input-compact" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      }
    />
  );

  if (loadingProfile) return (<>{Bar}<div className="container"><div className="meta">Cargando…</div></div></>);
  return (
    <>
      {Bar}
      <div className="container" style={{ display: 'grid', gap: 12 }}>
        <ResponsiveTasks anchorDate={date} onAnchorChange={setDate} currentUserId={userId ?? ''} isManager={isManager} />
      </div>
    </>
  );
}

function ResponsiveTasks({ anchorDate, onAnchorChange, currentUserId, isManager }: { anchorDate: string; onAnchorChange: (d: string) => void; currentUserId: string; isManager: boolean }){
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const on = () => setIsMobile(mql.matches); on();
    mql.addEventListener('change', on); return () => mql.removeEventListener('change', on);
  }, []);
  if (!isMobile) return <WeeklyMatrix anchorDate={anchorDate} currentUserId={currentUserId} isManager={isManager} />;
  return <MobileTasks anchorDate={anchorDate} onAnchorChange={onAnchorChange} currentUserId={currentUserId} isManager={isManager} />;
}

function MobileTasks({ anchorDate, onAnchorChange, currentUserId, isManager }: { anchorDate: string; onAnchorChange: (d: string) => void; currentUserId: string; isManager: boolean }){
  const [days, setDays] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<{ key: string; title: string; assigneeName: string; user_id?: string; days: Array<{ date: string; status: 'pending'|'overdue'|'completed'|'off'; late?: boolean }> }>>([]);
  const [loading, setLoading] = useState(true);
  const [weekAnchor, setWeekAnchor] = useState(anchorDate);
  const [dayIdx, setDayIdx] = useState(0);

  useEffect(() => { setWeekAnchor(anchorDate); }, [anchorDate]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { days, rows } = await getWeeklyMatrix(weekAnchor);
      if (!alive) return;
      setDays(days);
      // colocar el índice en el día actual si está dentro de la semana
      const today = new Date().toISOString().slice(0,10);
      const idx = Math.max(0, Math.min(6, days.findIndex(d => d === today)));
      setDayIdx(idx >= 0 ? idx : 0);
      setRows(rows as any);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [weekAnchor]);

  function prevDay(){ if (dayIdx > 0) setDayIdx(dayIdx - 1); else onAnchorChange(addDays(mondayOfWeek(weekAnchor), -7).toISOString().slice(0,10)); }
  function nextDay(){ if (dayIdx < 6) setDayIdx(dayIdx + 1); else onAnchorChange(addDays(mondayOfWeek(weekAnchor), 7).toISOString().slice(0,10)); }

  return (
    <div className="ticket" style={{ padding: 12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <button className="btn" onClick={prevDay}>◀ Anterior</button>
        <div className="section-title" style={{ margin: 0, fontSize: 18 }}>{days[dayIdx] ?? anchorDate}</div>
        <button className="btn" onClick={nextDay}>Siguiente ▶</button>
      </div>
      {loading ? <div className="meta">Cargando…</div> : (
        <div style={{ display:'grid', gap:8, marginTop:8 }}>
          {rows.map((r, i) => {
            const c = r.days[dayIdx];
            const canClick = c.status !== 'off' && (r.user_id === currentUserId || isManager);
            return (
              <div key={i} className="ticket" style={{ padding: 10, display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8 }}>
                <div>
                  <div style={{ fontWeight:800 }}>{r.title}</div>
                  <div className="meta">{r.assigneeName}</div>
                </div>
                <button
                  className="btn"
                  disabled={!canClick || new Date(c.date) > new Date()}
                  onClick={async () => {
                    if (!canClick || new Date(c.date) > new Date()) return;
                    await toggleCheck(r.user_id!, r.key as any, c.date);
                    const { days, rows } = await getWeeklyMatrix(weekAnchor);
                    setDays(days); setRows(rows as any);
                  }}
                >
                  {statusPill(c.status)} {c.late && c.status==='completed' ? <span className="badge" style={{ marginLeft:6, background:'#fff7ed', color:'#9a3412', borderColor:'#fed7aa' }}>Tarde</span> : null}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TechnicianTasks({ date, userId }: { date: string; userId: string }) {
  const [defs, setDefs] = useState<Array<{ key: any; title: string; user_id?: string }>>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [cutoff, setCutoff] = useState('10:00');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const resolved = await resolveDefaultTasksWithUserIds();
      const mine = resolved.filter(d => d.user_id === userId);
      const today = await getChecksForUser(userId, date);
      const map: Record<string, boolean> = {};
      for (const c of today) map[c.task_key] = true;
      if (alive) { setDefs(mine); setChecks(map); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [date, userId]);

  const canMark = isBusinessDay(new Date(date));

  async function toggle(k: any) {
    await toggleCheck(userId, k, date);
    setChecks((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  return (
    <div className="ticket" style={{ padding: 16 }}>
      <div className="section-title" style={{ marginTop: 0 }}>Mis tareas de hoy</div>
      {!canMark && <div className="meta">Hoy no es día laborable (Lun-Vie).</div>}
      {loading ? (
        <div className="meta">Cargando…</div>
      ) : defs.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {defs.map(d => (
            <label key={d.key} className="ticket" style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', alignItems: 'center', gap: 10, padding: 10 }}>
              <input type="checkbox" checked={!!checks[d.key as any]} onChange={() => toggle(d.key as any)} disabled={!canMark} />
              <span>{d.title}</span>
              <span className="meta">{date}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="meta">No tienes tareas asignadas.</div>
      )}
    </div>
  );
}

function ManagerTasks({ date }: { date: string }) {
  const [rows, setRows] = useState<Array<{ key: string; title: string; assigneeName: string; user_id?: string; done: boolean }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const matrix = await getManagerDailyMatrix(date);
      if (alive) { setRows(matrix); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [date]);

  return (
    <div className="ticket" style={{ padding: 16 }}>
      <div className="section-title" style={{ marginTop: 0 }}>Resumen diario del equipo</div>
      {loading ? (
        <div className="meta">Cargando…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 6px' }}>IT</th>
                <th style={{ textAlign: 'left', padding: '8px 6px' }}>Tarea</th>
                <th style={{ textAlign: 'left', padding: '8px 6px' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>{r.assigneeName}</td>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>{r.title}</td>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>
                    {r.done ? (
                      <span className="badge" style={{ background: '#dcfce7', color: '#166534', borderColor: '#86efac' }}>Completada</span>
                    ) : (
                      <span className="badge" style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' }}>Pendiente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function statusPill(status: 'pending' | 'overdue' | 'completed' | 'off') {
  if (status === 'off') return <span className="badge" style={{ background: '#e5e7eb', color: '#374151', borderColor: '#cbd5e1' }}>No laborable</span>;
  if (status === 'completed') return <span className="badge" style={{ background: '#dcfce7', color: '#166534', borderColor: '#86efac' }}>Completada</span>;
  if (status === 'overdue') return <span className="badge" style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' }}>Vencida</span>;
  return <span className="badge" style={{ background: '#e7f0ff', color: '#0b4aa2', borderColor: '#b9d2ff' }}>Pendiente</span>;
}

function WeeklyMatrix({ anchorDate, currentUserId, isManager }: { anchorDate: string; currentUserId: string; isManager: boolean }) {
  const [days, setDays] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<{ key: string; title: string; assigneeName: string; user_id?: string; weekdays?: number[]; active?: boolean; days: Array<{ date: string; status: 'pending'|'overdue'|'completed'|'off'; late?: boolean }> }>>([]);
  const [loading, setLoading] = useState(true);
  const [weekAnchor, setWeekAnchor] = useState(anchorDate);
  const [cutoff, updateCutoff] = useState('10:00');
  const [techs, setTechs] = useState<Array<{ id: string; name: string }>>([]);
  const [newTask, setNewTask] = useState<{ key?: string; title: string; user_id: string | ''; weekdays: number[] }>({ key: undefined, title: '', user_id: '', weekdays: [1,2,3,4,5] });
  const [openEditor, setOpenEditor] = useState(false);
  const [titleValidation, setTitleValidation] = useState<{ ok: boolean; key: string; suggestion?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
  const { days, rows, settings } = await getWeeklyMatrix(weekAnchor);
  if (alive) { setDays(days); setRows(rows as any); updateCutoff(settings.cutoff); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [weekAnchor]);

  // load technicians for assign dropdown
  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await listTechnicians();
      if (!alive) return;
      const opts = (list.data ?? []).map(u => ({ id: u.id, name: u.full_name ?? u.id }));
      setTechs(opts);
    })();
    return () => { alive = false; };
  }, []);

  // realtime: cuando alguien marca, refrescamos la semana
  useEffect(() => {
    const ch = supabase.channel('tasks.realtime');
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'it_daily_checks' }, () => {
      // refetch rápido
      (async () => {
        const { days, rows } = await getWeeklyMatrix(weekAnchor);
        setDays(days); setRows(rows as any);
      })();
    });
    void ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [weekAnchor]);

  async function onToggle(rowIdx: number, dayIdx: number) {
    const row = rows[rowIdx];
    const cell = row.days[dayIdx];
    // Permisos: el titular puede marcar su propia celda; el manager puede sobreescribir cualquier celda
    const canManager = isManager;
    const isOwner = row.user_id === currentUserId;
    if (!row.user_id || (!isOwner && !canManager)) return; // bloquea usuarios no dueños
    if (cell.status === 'off') return;
    // Regla: no se puede completar antes del día programado
    const todayYMD = new Date().toISOString().slice(0,10);
    if (cell.date > todayYMD) return;
    await toggleCheck(row.user_id, row.key as any, cell.date);
    // refresh in place
    setRows(prev => {
      const copy = prev.map(r => ({ ...r, days: r.days.map(d => ({ ...d })) }));
      const d = copy[rowIdx].days[dayIdx];
      d.status = d.status === 'completed' ? 'pending' : 'completed';
      return copy as any;
    });
  }

  async function saveCutoff() {
    await setTaskSettings({ cutoff });
    // refetch to recalculate overdue vs pendiente
    const { days, rows, settings } = await getWeeklyMatrix(weekAnchor);
    setDays(days); setRows(rows as any); updateCutoff(settings.cutoff);
  }

  async function doFullRefresh() {
    try {
      setRefreshing(true);
      const { days, rows, settings } = await getWeeklyMatrix(weekAnchor);
      setDays(days); setRows(rows as any); updateCutoff(settings.cutoff);
    } finally {
      setRefreshing(false);
    }
  }

  function WeekdaysSelector({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
    const days = [
      { n: 1, label: 'L' },
      { n: 2, label: 'M' },
      { n: 3, label: 'X' },
      { n: 4, label: 'J' },
      { n: 5, label: 'V' },
      { n: 6, label: 'S' },
      { n: 7, label: 'D' },
    ];
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        {days.map(d => (
          <label key={d.n} className="badge" style={{ cursor: 'pointer', userSelect: 'none', padding: '6px 8px', background: value.includes(d.n) ? '#0b4aa2' : '#eef2ff', color: value.includes(d.n) ? 'white' : '#0b4aa2', borderColor: '#b9d2ff' }}>
            <input type="checkbox" checked={value.includes(d.n)} onChange={(e) => {
              const v = e.target.checked ? [...value, d.n] : value.filter(x => x !== d.n);
              onChange(v.sort((a,b) => a-b));
            }} style={{ display: 'none' }} />
            {d.label}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="ticket" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div className="section-title" style={{ marginTop: 0, marginBottom: 6 }}>Semana laboral</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="btn" onClick={() => setWeekAnchor(addDays(mondayOfWeek(weekAnchor), -7).toISOString().slice(0,10))}>◀ Semana anterior</button>
          <input className="input input-compact" type="date" value={weekAnchor} onChange={(e) => setWeekAnchor(e.target.value)} />
          <button className="btn" onClick={() => setWeekAnchor(addDays(mondayOfWeek(weekAnchor), 7).toISOString().slice(0,10))}>Semana siguiente ▶</button>
          {isManager && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
              <span className="meta">Hora límite</span>
              <input className="input input-compact" type="time" value={cutoff} onChange={(e) => updateCutoff(e.target.value)} />
              <button className="btn" onClick={saveCutoff}>Guardar</button>
            </span>
          )}
        </div>
      </div>
      {isManager && (
        <div className="ticket" style={{ padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="meta">Administrar tareas</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => { setNewTask({ key: undefined, title: '', user_id: '', weekdays: [1,2,3,4,5] }); setTitleValidation(null); setOpenEditor(true); }}>Nueva tarea</button>
            <button className="btn" onClick={() => { setOpenEditor(true); }}>Editar tareas</button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="meta">Cargando…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 6px' }}>IT</th>
                <th style={{ textAlign: 'left', padding: '8px 6px' }}>Tarea</th>
                {days.map((d) => {
                  const date = new Date(d);
                  const dayNum = String(date.getDate()).padStart(2,'0');
                  const wd = date.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0,3); // lun, mar, mié, jue, vie, sáb, dom
                  const wdInit = wd.replace('.', '').slice(0,3);
                  return (
                    <th key={d} style={{ textAlign: 'center', padding: '8px 6px' }}>{`${wdInit} ${dayNum}`}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>{r.assigneeName}</td>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>{r.title}</td>
                  {r.days.map((c, j) => (
                    <td key={j} style={{ padding: '8px 6px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                      <button
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: 12, borderRadius: 8, cursor: (c.status !== 'off' && (r.user_id === currentUserId || isManager)) ? 'pointer' : 'default', opacity: (r.user_id === currentUserId || isManager) ? 1 : .75 }}
                        onClick={() => onToggle(i, j)}
                        disabled={c.status === 'off' || (!isManager && r.user_id !== currentUserId) || (new Date(c.date) > new Date())}
                        title={(new Date(c.date) > new Date()) ? 'No puedes completar antes del día programado' : ((r.user_id === currentUserId || isManager) ? 'Marcar completada' : 'Solo el titular o el manager pueden marcar')}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {statusPill(c.status)}
                          {c.late && c.status === 'completed' && (
                            <span className="badge" style={{ background: '#fff7ed', color: '#9a3412', borderColor: '#fed7aa' }}>Tarde</span>
                          )}
                        </span>
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FAB de refresco para Tasks */}
      <button
        type="button"
        className={`refresh-fab ${refreshing ? 'is-spinning' : ''}`}
        title="Actualizar"
        aria-label="Actualizar"
        aria-busy={refreshing}
        onClick={doFullRefresh}
        style={{ position: 'fixed', right: 16, bottom: 16, width: 46, height: 46, borderRadius: 999, background: 'var(--blue-600)', color: '#fff', border: 'none', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, zIndex: 50, animation: refreshing ? 'spin 1s linear infinite' as any : undefined }}
      >
        ↻
      </button>
      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Modal de creación/edición */}
      {isManager && (
        <AppModal
          open={openEditor}
          title={newTask.key ? 'Editar tarea' : 'Nueva tarea'}
          onClose={() => setOpenEditor(false)}
          primary={{
            label: 'Guardar',
            onClick: async () => {
              // Validate title and slug collision
              const res = await validateTaskTitle(newTask.title, newTask.key);
              setTitleValidation(res);
              if (!res.ok) return; // ask user to adjust title first
              await upsertTaskDef({ key: newTask.key ?? res.key, title: newTask.title, user_id: newTask.user_id || null, weekdays: newTask.weekdays });
              const { days, rows, settings } = await getWeeklyMatrix(weekAnchor);
              setDays(days); setRows(rows as any); updateCutoff(settings.cutoff);
              setOpenEditor(false);
            },
          }}
          secondary={{ label: 'Cancelar', onClick: () => setOpenEditor(false) }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="meta">Título</label>
              <input className="input" placeholder="Título de la tarea" value={newTask.title} onChange={async (e) => {
                const t = e.target.value; setNewTask(v => ({ ...v, title: t }));
                if (t.trim().length) setTitleValidation(await validateTaskTitle(t, newTask.key)); else setTitleValidation(null);
              }} />
              {titleValidation && !titleValidation.ok && (
                <div className="meta" style={{ color: '#9a3412' }}>
                  Ya existe una tarea con la misma clave (<code>{titleValidation.key}</code>). Sugerencia: <code>{titleValidation.suggestion}</code> o cambia el título.
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="meta">Asignar a</label>
              <select className="input" value={newTask.user_id} onChange={(e) => setNewTask(v => ({ ...v, user_id: e.target.value }))}>
                <option value="">— Sin asignar —</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="meta">Días laborables</label>
              <WeekdaysSelector value={newTask.weekdays} onChange={(v) => setNewTask(prev => ({ ...prev, weekdays: v }))} />
              <div className="meta">Por defecto: L–V</div>
            </div>

            {/* Listado para edición rápida */}
            <div style={{ marginTop: 12, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
              <div className="meta" style={{ marginBottom: 6 }}>Tareas existentes</div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 6px' }}>Clave</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px' }}>Título</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px' }}>Asignado</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px' }}>Días</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.key}>
                        <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>{r.key}</td>
                        <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>
                          <input className="input" defaultValue={r.title} onBlur={async (e) => {
                            const t = e.target.value;
                            if (t !== r.title) {
                              await upsertTaskDef({ key: r.key, title: t, user_id: r.user_id ?? null, weekdays: r.weekdays ?? undefined });
                              const { days, rows, settings } = await getWeeklyMatrix(weekAnchor);
                              setDays(days); setRows(rows as any); updateCutoff(settings.cutoff);
                            }
                          }} />
                        </td>
                        <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>
                          <select className="input" defaultValue={r.user_id ?? ''} onChange={async (e) => {
                            await upsertTaskDef({ key: r.key, title: r.title, user_id: e.target.value || null, weekdays: r.weekdays ?? undefined });
                            const { days, rows, settings } = await getWeeklyMatrix(weekAnchor);
                            setDays(days); setRows(rows as any); updateCutoff(settings.cutoff);
                          }}>
                            <option value="">— Sin asignar —</option>
                            {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>
                          <WeekdaysSelector value={r.weekdays ?? [1,2,3,4,5]} onChange={async (v) => {
                            await upsertTaskDef({ key: r.key, title: r.title, user_id: r.user_id ?? null, weekdays: v });
                            const { days, rows, settings } = await getWeeklyMatrix(weekAnchor);
                            setDays(days); setRows(rows as any); updateCutoff(settings.cutoff);
                          }} />
                        </td>
                        <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>
                          <button className="btn btn-ghost" onClick={async () => {
                            await deleteTaskDef(r.key);
                            const { days, rows, settings } = await getWeeklyMatrix(weekAnchor);
                            setDays(days); setRows(rows as any); updateCutoff(settings.cutoff);
                          }}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </AppModal>
      )}
    </div>
  );
}
