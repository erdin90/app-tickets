'use client';
import { toast } from 'sonner';

import PageBar from '@/components/PageBar';
import StackedBar from '@/components/StackedBar';
import AreaCompare from '@/components/AreaCompare';
import BarChart from '@/components/BarChart';
import HBarChart from '@/components/HBarChart';
import DonutChart from '@/components/DonutChart';
import { useEffect, useState } from 'react';
import { getSummary, getTicketsByBusiness, getTicketsByPriority, getStackedByMonth, type ReportFilters, getTicketsRaw } from '@/lib/reports';
import { getTasksComplianceByIT } from '@/lib/tasks';
import { downloadCSV } from '@/lib/export';
import { listTechnicians } from '@/lib/users';
import AppModal from '@/components/AppModal';
import { BUSINESSES, businessColorByLabel } from '@/lib/businesses';

export default function ReportsPage() {
  // detect mobile for chart variants
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  const [rangePreset, setRangePreset] = useState<'12m' | '6m' | '1m'>('12m');
  const [filters, setFilters] = useState<ReportFilters>({ status: 'all', priority: 'all', business: 'all', technician: 'all' });

  // UI filter state
  const [from, setFrom] = useState<string | ''>('');
  const [to, setTo] = useState<string | ''>('');
  const [status, setStatus] = useState<ReportFilters['status']>('all');
  const [priority, setPriority] = useState<ReportFilters['priority']>('all');
  const [business, setBusiness] = useState<string | 'all'>('all');
  const [technician, setTechnician] = useState<string | 'all' | 'unassigned'>('all');
  const [techOptions, setTechOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Draft states for modal (to avoid applying changes until "Aplicar")
  const [dFrom, setDFrom] = useState<string | ''>('');
  const [dTo, setDTo] = useState<string | ''>('');
  const [dStatus, setDStatus] = useState<ReportFilters['status']>('all');
  const [dPriority, setDPriority] = useState<ReportFilters['priority']>('all');
  const [dBusiness, setDBusiness] = useState<string | 'all'>('all');
  const [dTechnician, setDTechnician] = useState<string | 'all' | 'unassigned'>('all');

  function openFilters() {
    setDFrom(from); setDTo(to); setDStatus(status); setDPriority(priority); setDBusiness(business); setDTechnician(technician);
    setFiltersOpen(true);
  }
  function applyFilters() {
    setFrom(dFrom); setTo(dTo); setStatus(dStatus); setPriority(dPriority); setBusiness(dBusiness); setTechnician(dTechnician);
    setFiltersOpen(false);
  }
  function clearFilters() {
    setDFrom(''); setDTo(''); setDStatus('all'); setDPriority('all'); setDBusiness('all'); setDTechnician('all');
  }

  const Bar = (
    <PageBar
      title="Reportes"
      subtitle="Análisis y métricas"
      right={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={openFilters}>Filtros</button>
          <button className="btn" onClick={handleExport}>Exportar</button>
        </div>
      }
    />
  );

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ total: number; open: number; overdue: number; closed: number } | null>(null);
  const [stacked, setStacked] = useState<{ labels: string[]; created: number[]; closed: number[] } | null>(null);
  const [byBusiness, setByBusiness] = useState<{ labels: string[]; data: number[] } | null>(null);
  const [byPriority, setByPriority] = useState<{ labels: string[]; data: number[] } | null>(null);
  const [tasksByIT, setTasksByIT] = useState<Array<{ id: string; name: string; completed: number; pending: number; total: number }>>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        // cargar técnicos para selector
        const list = await listTechnicians();
        if (active) setTechOptions((list.data ?? []).map(u => ({ id: u.id, name: u.full_name ?? u.id })));

        const f: ReportFilters = {
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(new Date(to).setHours(23,59,59,999)).toISOString() : undefined,
          status,
          priority,
          business,
          technician,
        };
        setFilters(f);

        const months = rangePreset === '12m' ? 12 : rangePreset === '6m' ? 6 : 1;
        const [s, sm, b, p] = await Promise.all([
          getSummary(f),
          getStackedByMonth(months, f),
          getTicketsByBusiness(months, f),
          getTicketsByPriority(months, f),
        ]);
        if (!active) return;
        setSummary(s);
        setStacked(sm);
        setByBusiness(b);
        setByPriority(p);
        // Extra: tareas por IT en el rango, con % de cumplimiento real
        try {
          const comp = await getTasksComplianceByIT(
            from ? new Date(from).toISOString().slice(0,10) : undefined,
            to ? new Date(to).toISOString().slice(0,10) : undefined,
          );
          setTasksByIT(comp.map(c => ({ id: c.id, name: c.name, completed: c.completed, pending: Math.max(0, c.total - c.completed), total: c.total })));
        } catch { /* ignore */ }
        setErr(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e ?? 'Error');
        setErr(msg);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [from, to, status, priority, business, technician, rangePreset]);

  async function handleExport() {
    try {
      const rows = await getTicketsRaw(filters);
      downloadCSV(rows, 'tickets_report.csv');
    } catch (e) {
      console.error('[export csv]', e);
  toast.error('No se pudo exportar el CSV');
    }
  }

  return (
    <>
      {Bar}
      <div className="container" style={{ display: 'grid', gap: 16 }}>
        {err && <div className="ticket" style={{ padding: 16, color: 'var(--danger)' }}>{err}</div>}

        {/* KPI Cards */}
        <section className="stats-grid">
          <div className="stat-card stat--active">
            <div className="stat-label">Tickets totales</div>
            <div className="stat-value">{summary?.total ?? (loading ? '…' : 0)}</div>
          </div>
          <div className="stat-card stat--active">
            <div className="stat-label">Tickets abiertos</div>
            <div className="stat-value">{summary?.open ?? (loading ? '…' : 0)}</div>
          </div>
          <div className="stat-card stat--overdue">
            <div className="stat-label">Tickets vencidos</div>
            <div className="stat-value">{summary?.overdue ?? (loading ? '…' : 0)}</div>
          </div>
          <div className="stat-card stat--completed">
            <div className="stat-label">Tickets cerrados</div>
            <div className="stat-value">{summary?.closed ?? (loading ? '…' : 0)}</div>
          </div>
        </section>

        {/* Charts Row 1: Stacked/Area by Month + Status Donut */}
        <section className="grid" style={{ gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.4fr) minmax(0,1fr)', gap: 12 }}>
          <div className="ticket" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="section-title" style={{ margin: 0 }}>Tickets por mes</div>
              <select
                className="input input-compact"
                value={rangePreset}
                onChange={(e) => setRangePreset(e.target.value as '12m' | '6m' | '1m')}
                title="Rango"
                style={{ width: 160 }}
              >
                <option value="12m">Últimos 12 meses</option>
                <option value="6m">Últimos 6 meses</option>
                <option value="1m">Mes actual</option>
              </select>
            </div>
            <div className="meta">Creados vs cerrados</div>
            <div style={{ marginTop: 12 }}>
              {stacked ? (
                isMobile ? (
                  <AreaCompare labels={stacked.labels} a={stacked.created} b={stacked.closed} height={180} />
                ) : (
                  <StackedBar labels={stacked.labels} a={stacked.created} b={stacked.closed} height={180} />
                )
              ) : (
                <div className="meta">{loading ? 'Cargando…' : 'Sin datos'}</div>
              )}
            </div>
          </div>
          <div className="ticket" style={{ padding: 16 }}>
            <div className="section-title" style={{ margin: 0 }}>Tickets por estado</div>
            <div style={{ marginTop: 12, display: 'flex', gap: 16, alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <DonutChart
                values={[
                  summary?.closed ?? 0,
                  Math.max(0, (summary?.open ?? 0) - (summary?.overdue ?? 0)),
                  summary?.overdue ?? 0,
                ]}
                labels={["Cerrados", "Abiertos", "Vencidos"]}
                colors={["#3b82f6", "#93c5fd", "#ef4444"]}
                size={isMobile ? 140 : 180}
                stroke={18}
              />
            </div>
          </div>
        </section>

        {/* Charts Row 2: By Business + Priority (switch to horizontal bars on mobile) */}
        <section className="grid" style={{ gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
          <div className="ticket" style={{ padding: 16 }}>
            <div className="section-title" style={{ margin: 0 }}>Tickets por Negocios</div>
            <div style={{ marginTop: 12 }}>
              {byBusiness ? (
                isMobile ? (
                  <HBarChart
                    data={byBusiness.data}
                    labels={byBusiness.labels}
                    colors={byBusiness.labels.map(l => businessColorByLabel(l) ?? '#2563eb')}
                  />
                ) : (
                  <BarChart data={byBusiness.data} labels={byBusiness.labels} height={180} />
                )
              ) : (
                <div className="meta">{loading ? 'Cargando…' : 'Sin datos'}</div>
              )}
            </div>
          </div>
          <div className="ticket" style={{ padding: 16 }}>
            <div className="section-title" style={{ margin: 0 }}>Tickets por prioridad</div>
            <div style={{ marginTop: 12 }}>
              {byPriority ? (
                isMobile ? (
                  <HBarChart
                    data={byPriority.data}
                    labels={byPriority.labels.map(l => l)}
                    colors={byPriority.labels.map(l => l === 'Baja' ? '#9ca3af' : l === 'Alta' ? '#ef4444' : '#2563eb')}
                  />
                ) : (
                  <BarChart
                    data={byPriority.data}
                    labels={byPriority.labels}
                    height={180}
                    colors={byPriority.labels.map(l => l === 'Baja' ? '#9ca3af' : l === 'Alta' ? '#ef4444' : '#2563eb')}
                    showValues
                  />
                )
              ) : (
                <div className="meta">{loading ? 'Cargando…' : 'Sin datos'}</div>
              )}
            </div>
          </div>
        </section>

        {/* Tasks por IT (resumen simple) */}
        {tasksByIT.length > 0 && (
          <section className="grid" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
            <div className="ticket" style={{ padding: 16 }}>
              <div className="section-title" style={{ margin: 0 }}>Cumplimiento de tareas por IT</div>
              <div className="meta">Porcentaje calculado en el rango seleccionado (incluye sólo días laborables/activos por tarea).</div>
              <div style={{ marginTop: 12, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 6px' }}>IT</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px' }}>Completadas</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px' }}>Esperadas</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px' }}>% Cumplimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasksByIT.map((r) => (
                      <tr key={r.id}>
                        <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>{r.name}</td>
                        <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>{r.completed}</td>
                        <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>{r.total}</td>
                        <td style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>
                          {r.total > 0 ? `${Math.round((r.completed / r.total) * 100)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Modal de filtros */}
      <AppModal
        open={filtersOpen}
        title="Filtros"
        onClose={() => setFiltersOpen(false)}
        primary={{ label: 'Aplicar', onClick: applyFilters }}
        secondary={{ label: 'Limpiar', onClick: clearFilters }}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'grid', gap: 6 }}>Desde<input className="input" type="date" value={dFrom} onChange={(e) => setDFrom(e.target.value)} /></label>
            <label style={{ display: 'grid', gap: 6 }}>Hasta<input className="input" type="date" value={dTo} onChange={(e) => setDTo(e.target.value)} /></label>
          </div>
            <label style={{ display: 'grid', gap: 6 }}>Estado
            <select className="input" value={dStatus ?? 'all'} onChange={(e) => setDStatus(e.target.value as ReportFilters['status'])}>
              <option value="all">Todos</option>
              <option value="open">Abiertos</option>
              <option value="overdue">Vencidos</option>
              <option value="completed">Cerrados</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>Prioridad
            <select className="input" value={dPriority ?? 'all'} onChange={(e) => setDPriority(e.target.value as ReportFilters['priority'])}>
              <option value="all">Todas</option>
              <option value="low">Baja</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>Técnico
            <select className="input" value={dTechnician ?? 'all'} onChange={(e) => setDTechnician(e.target.value as 'all' | 'unassigned' | string)}>
              <option value="all">Todos</option>
              <option value="unassigned">Sin asignar</option>
              {techOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>Área
            <select className="input" value={dBusiness} onChange={(e) => setDBusiness(e.target.value)}>
              <option value="all">Todas</option>
              {BUSINESSES.map(b => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </label>
        </div>
      </AppModal>
    </>
  );
}
