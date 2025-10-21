// src/lib/tasks.ts
import { supabase } from '@/lib/supabase';

export type DailyTaskDef = {
  key: 'backup' | 'servers' | 'printers' | 'cameras' | 'tickets';
  title: string;
  assigneeName: string; // display name (only used as fallback when table not present)
  weekdays?: number[];  // 1..7 (Mon=1) default Mon..Fri
};

export type DailyCheck = {
  user_id: string;
  task_key: DailyTaskDef['key'];
  date: string; // YYYY-MM-DD
  completed_at: string | null;
};

export const DEFAULT_TASKS: DailyTaskDef[] = [
  { key: 'backup',   title: 'Revisar las salvas',             assigneeName: 'Erdin' },
  { key: 'servers',  title: 'Revisar los servidores',         assigneeName: 'Johan' },
  { key: 'printers', title: 'Revisar las impresoras',         assigneeName: 'Yohan' },
  { key: 'cameras',  title: 'Revisar las cámaras Unifi',      assigneeName: 'Yohandy' },
  { key: 'tickets',  title: 'Revisar los tickets pendientes', assigneeName: 'Yamira' },
];

export function isBusinessDay(d = new Date()) {
  const day = d.getDay(); // 0 Sun .. 6 Sat
  return day >= 1 && day <= 5; // Mon..Fri
}

export function formatDate(d = new Date()) {
  return toYMD(d);
}

export async function getProfilesByNames(names: string[]) {
  const unique = Array.from(new Set(names.filter(Boolean)));
  if (!unique.length) return [] as { id: string; full_name: string }[];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('full_name', unique)
    .limit(1000);
  if (error) return [] as { id: string; full_name: string }[];
  return (data ?? []) as { id: string; full_name: string }[];
}

export async function resolveDefaultTasksWithUserIds() {
  const profiles = await getProfilesByNames(DEFAULT_TASKS.map(t => t.assigneeName));
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  const findId = (name: string) => {
    const n = norm(name);
    // exact match first
    const exact = profiles.find(p => norm(p.full_name) === n)?.id;
    if (exact) return exact;
    // fallback startsWith
    return profiles.find(p => norm(p.full_name).startsWith(n))?.id;
  };
  return DEFAULT_TASKS.map(t => ({ ...t, user_id: findId(t.assigneeName) })) as Array<DailyTaskDef & { user_id?: string | undefined }>;
}

/** Returns today checks for given user tasks (fallback-friendly) */
export async function getChecksForUser(user_id: string, date = formatDate()) {
  try {
    const { data, error } = await supabase
      .from('it_daily_checks')
      .select('user_id, task_key, date, completed_at')
      .eq('user_id', user_id)
      .eq('date', date)
      .limit(100);
    if (error) throw error;
    return (data ?? []) as DailyCheck[];
  } catch {
    // Fallback: localStorage cache to allow UI demo
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(`checks:${user_id}:${date}`) || '[]';
      return JSON.parse(raw) as DailyCheck[];
    }
    return [] as DailyCheck[];
  }
}

export async function toggleCheck(user_id: string, task_key: DailyTaskDef['key'], date = formatDate()) {
  const now = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from('it_daily_checks')
      .upsert({ user_id, task_key, date, completed_at: now }, { onConflict: 'user_id,task_key,date' })
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, data } as const;
  } catch (e) {
    // Fallback to localStorage toggle
    if (typeof window !== 'undefined') {
      const key = `checks:${user_id}:${date}`;
      const arr: DailyCheck[] = JSON.parse(localStorage.getItem(key) || '[]');
      const found = arr.find(c => c.task_key === task_key);
      if (found) {
        // toggle off if exists -> remove
        const next = arr.filter(c => c.task_key !== task_key);
        localStorage.setItem(key, JSON.stringify(next));
      } else {
        arr.push({ user_id, task_key, date, completed_at: now });
        localStorage.setItem(key, JSON.stringify(arr));
      }
      return { ok: true, data: null } as const;
    }
    return { ok: false, error: String(e) } as const;
  }
}

/** Manager view: get all default tasks with completion for date */
export async function getManagerDailyMatrix(date = formatDate()) {
  const defs = await resolveDefaultTasksWithUserIds();
  const ids = defs.map(d => d.user_id).filter(Boolean) as string[];
  let checks: DailyCheck[] = [];
  try {
    if (ids.length) {
      const { data, error } = await supabase
        .from('it_daily_checks')
        .select('user_id, task_key, date, completed_at')
        .eq('date', date)
        .in('user_id', ids)
        .limit(1000);
      if (error) throw error;
      checks = (data ?? []) as DailyCheck[];
    }
  } catch {
    // Fallback: aggregate from localStorage (best-effort)
    if (typeof window !== 'undefined') {
      for (const id of ids) {
        const raw = localStorage.getItem(`checks:${id}:${date}`) || '[]';
        checks.push(...(JSON.parse(raw) as DailyCheck[]));
      }
    }
  }

  const map = new Map<string, boolean>(); // key: user_id|task_key
  for (const c of checks) map.set(`${c.user_id}|${c.task_key}`, true);
  return defs.map(d => ({
    key: d.key,
    title: d.title,
    assigneeName: d.assigneeName,
    user_id: d.user_id,
    done: d.user_id ? !!map.get(`${d.user_id}|${d.key}`) : false,
  }));
}

/* ========= Weekly matrix ========= */
export type TaskStatus = 'pending' | 'overdue' | 'completed' | 'off';

function parseYMDLocal(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function mondayOfWeek(dateStr: string) {
  const d = parseYMDLocal(dateStr);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day); // move to Monday
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0,0,0,0);
  return m;
}

export function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(d.getDate() + days);
  return x;
}

export function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type TaskSettings = { cutoff: string }; // 'HH:MM'

export function parseCutoff(cutoff?: string) {
  const [h, m] = (cutoff || '10:00').split(':').map(Number);
  return { h: isNaN(h) ? 10 : h, m: isNaN(m) ? 0 : m };
}

export async function getTaskSettings(): Promise<TaskSettings> {
  try {
    const { data, error } = await supabase
      .from('it_task_settings')
      .select('cutoff_time')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const cutoff = (data?.cutoff_time as string | null) ?? '10:00';
    return { cutoff };
  } catch {
    // fallback local
    if (typeof window !== 'undefined') {
      const cutoff = localStorage.getItem('it_cutoff_time') || '10:00';
      return { cutoff };
    }
    return { cutoff: '10:00' };
  }
}

export async function setTaskSettings(s: TaskSettings) {
  try {
    const { error } = await supabase
      .from('it_task_settings')
      .upsert({ id: 'default', cutoff_time: s.cutoff }, { onConflict: 'id' });
    if (error) throw error;
  } catch {
    if (typeof window !== 'undefined') localStorage.setItem('it_cutoff_time', s.cutoff);
  }
}

export function statusFor(dateStr: string, check?: DailyCheck | null, cutoff?: string): TaskStatus {
  const d = new Date(dateStr);
  if (!isBusinessDay(d)) return 'off';
  if (check?.completed_at) return 'completed';
  // threshold 10:00 local time of that date
  const { h, m } = parseCutoff(cutoff);
  const thr = new Date(d); thr.setHours(h, m, 0, 0);
  const now = new Date();
  return now > thr ? 'overdue' : 'pending';
}

export type TaskDefRow = { key: string; title: string; user_id?: string; weekdays?: number[] | null; active?: boolean | null };

export async function getTaskDefinitions(): Promise<TaskDefRow[]> {
  try {
    const { data, error } = await supabase
      .from('it_task_defs')
      .select('task_key, title, user_id, weekdays, active')
      .order('task_key');
    if (error) throw error;
    const rows = (data ?? []).map((r: any) => ({ key: r.task_key, title: r.title, user_id: r.user_id || undefined, weekdays: r.weekdays ?? null, active: r.active ?? null }));
    // if table exists but is empty, return empty and let manager create tasks
    if (rows.length === 0) {
      // also merge any local fallback created rows
      if (typeof window !== 'undefined') {
        const local = JSON.parse(localStorage.getItem('it_task_defs') || '[]');
        return local as TaskDefRow[];
      }
      return rows;
    }
    return rows;
  } catch {
    // Supabase not available or table missing: fallback to defaults or local
    if (typeof window !== 'undefined') {
      const local = JSON.parse(localStorage.getItem('it_task_defs') || '[]');
      if (local.length) return local as TaskDefRow[];
    }
    const fallback = await resolveDefaultTasksWithUserIds();
    return fallback.map(f => ({ key: f.key, title: f.title, user_id: (f as any).user_id }));
  }
}

export async function getTaskDefinitionsWithNames(): Promise<Array<TaskDefRow & { assigneeName: string }>> {
  const defs = await getTaskDefinitions();
  const ids = defs.map(d => d.user_id).filter(Boolean) as string[];
  let names = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    (data ?? []).forEach((p: any) => names.set(p.id, p.full_name ?? p.id));
  }
  return defs.map(d => ({ ...d, assigneeName: d.user_id ? (names.get(d.user_id) ?? d.user_id) : '—' }));
}

function weekdayIndex1to7(dateStr: string) {
  const d = new Date(dateStr);
  const js = d.getDay(); // 0..6 Sun..Sat
  return js === 0 ? 7 : js; // 1..7 Mon..Sun
}

export async function getWeeklyMatrix(anchorDate = formatDate()) {
  const start = mondayOfWeek(anchorDate);
  const days = Array.from({ length: 7 }, (_, i) => toYMD(addDays(start, i)));
  const defs = await getTaskDefinitionsWithNames();
  const ids = defs.map(d => d.user_id).filter(Boolean) as string[];
  const settings = await getTaskSettings();

  // Fetch all checks for the week and involved users
  let checks: DailyCheck[] = [];
  try {
    if (ids.length) {
      const { data, error } = await supabase
        .from('it_daily_checks')
        .select('user_id, task_key, date, completed_at')
        .gte('date', days[0])
        .lte('date', days[6])
        .in('user_id', ids)
        .limit(5000);
      if (error) throw error;
      checks = (data ?? []) as DailyCheck[];
    }
  } catch {
    // local fallback aggregate
    if (typeof window !== 'undefined') {
      for (const id of ids) {
        for (const d of days) {
          const raw = localStorage.getItem(`checks:${id}:${d}`) || '[]';
          checks.push(...(JSON.parse(raw) as DailyCheck[]));
        }
      }
    }
  }
  const map = new Map<string, DailyCheck>(); // key: user_id|task|date
  for (const c of checks) map.set(`${c.user_id}|${c.task_key}|${c.date}`, c);

  const rows = defs.map(d => ({
    key: d.key,
    title: d.title,
    assigneeName: d.assigneeName,
    user_id: d.user_id,
    weekdays: d.weekdays ?? undefined,
    active: d.active ?? undefined,
    days: days.map(date => {
      const ch = d.user_id ? map.get(`${d.user_id}|${d.key}|${date}`) : undefined;
      // Respect per-task weekdays if provided; default Mon..Fri business days
      const w = weekdayIndex1to7(date);
      const isActiveDay = Array.isArray(d.weekdays) && d.weekdays?.length
        ? (d.weekdays as number[]).includes(w)
        : isBusinessDay(new Date(date));
      let status: TaskStatus = 'off';
      let late = false;
      if (isActiveDay) {
        status = statusFor(date, ch, settings.cutoff);
        if (ch?.completed_at) {
          const { h, m } = parseCutoff(settings.cutoff);
          const thr = new Date(date); thr.setHours(h, m, 0, 0);
          const fin = new Date(ch.completed_at);
          late = fin > thr;
        }
      }
      return { date, status, completed: !!ch?.completed_at, late } as { date: string; status: TaskStatus; completed: boolean; late: boolean };
    }),
  }));
  return { days, rows, settings } as const;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);
}

export async function upsertTaskDef(row: { key?: string; title: string; user_id: string | null; weekdays?: number[]; active?: boolean }) {
  try {
    const task_key = (row.key && row.key.trim().length) ? row.key : slugify(row.title);
    const payload: any = {
      task_key,
      title: row.title,
      user_id: row.user_id,
    };
    if (row.weekdays) payload.weekdays = row.weekdays;
    if (typeof row.active === 'boolean') payload.active = row.active;

    const { error } = await supabase
      .from('it_task_defs')
      .upsert(payload, { onConflict: 'task_key' });
    if (error) throw error;
    return { ok: true } as const;
  } catch (e) {
    // local fallback for offline demo
    if (typeof window !== 'undefined') {
      const list: TaskDefRow[] = JSON.parse(localStorage.getItem('it_task_defs') || '[]');
      const key = (row.key && row.key.trim().length) ? row.key : slugify(row.title);
      const idx = list.findIndex(r => r.key === key);
      const item: TaskDefRow = { key, title: row.title, user_id: row.user_id ?? undefined, weekdays: row.weekdays ?? null, active: typeof row.active === 'boolean' ? row.active : null };
      if (idx >= 0) list[idx] = item; else list.push(item);
      localStorage.setItem('it_task_defs', JSON.stringify(list));
      return { ok: true } as const;
    }
    return { ok: false, error: String(e) } as const;
  }
}

export async function deleteTaskDef(task_key: string) {
  try {
    const { error } = await supabase
      .from('it_task_defs')
      .delete()
      .eq('task_key', task_key);
    if (error) throw error;
    return { ok: true } as const;
  } catch (e) {
    if (typeof window !== 'undefined') {
      const list: TaskDefRow[] = JSON.parse(localStorage.getItem('it_task_defs') || '[]');
      const next = list.filter(r => r.key !== task_key);
      localStorage.setItem('it_task_defs', JSON.stringify(next));
      return { ok: true } as const;
    }
    return { ok: false, error: String(e) } as const;
  }
}

/** Validate a task title doesn't collide on slug; returns suggestion if needed */
export async function validateTaskTitle(title: string, currentKey?: string) {
  const key = slugify(title);
  const defs = await getTaskDefinitions();
  const exists = defs.some(d => d.key === key && d.key !== currentKey);
  if (!exists) return { ok: true as const, key };
  // suggest with -2, -3, ...
  let i = 2;
  let suggestion = `${key}-${i}`;
  const existingKeys = new Set(defs.map(d => d.key));
  while (existingKeys.has(suggestion)) {
    i += 1;
    suggestion = `${key}-${i}`;
    if (i > 99) break;
  }
  return { ok: false as const, key, suggestion };
}

/* ========= Reports: cumplimiento por IT ========= */
function daysBetweenYMD(startYMD: string, endYMD: string) {
  const start = parseYMDLocal(startYMD);
  const end = parseYMDLocal(endYMD);
  const res: string[] = [];
  let cur = new Date(start);
  cur.setHours(0,0,0,0);
  while (cur <= end) {
    res.push(toYMD(cur));
    cur = addDays(cur, 1);
  }
  return res;
}

export async function getTasksComplianceByIT(fromYMD?: string, toYMDStr?: string): Promise<Array<{ id: string; name: string; completed: number; total: number }>> {
  // Determinar rango por defecto: mes actual si no se provee
  const now = new Date();
  const startDefault = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDefault = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startYMD = (fromYMD && fromYMD.length) ? fromYMD : toYMD(startDefault);
  const endYMD = (toYMDStr && toYMDStr.length) ? toYMDStr : toYMD(endDefault);

  const days = daysBetweenYMD(startYMD, endYMD);
  const defs = await getTaskDefinitionsWithNames();
  const assigned = defs.filter(d => !!d.user_id);
  const userIds = Array.from(new Set(assigned.map(d => d.user_id!).filter(Boolean)));

  // Conjunto de claves esperadas user|task|date para validar checks
  const expectedKeys = new Set<string>();
  const totalsByUser = new Map<string, number>();
  for (const d of assigned) {
    const uid = d.user_id!;
    for (const ymd of days) {
      const w = weekdayIndex1to7(ymd);
      const isActiveDay = Array.isArray(d.weekdays) && d.weekdays?.length
        ? (d.weekdays as number[]).includes(w)
        : isBusinessDay(parseYMDLocal(ymd));
      if (!isActiveDay) continue;
      expectedKeys.add(`${uid}|${d.key}|${ymd}`);
      totalsByUser.set(uid, (totalsByUser.get(uid) ?? 0) + 1);
    }
  }

  // Traer checks en el rango
  let checks: DailyCheck[] = [];
  try {
    if (userIds.length) {
      const { data, error } = await supabase
        .from('it_daily_checks')
        .select('user_id, task_key, date, completed_at')
        .gte('date', startYMD)
        .lte('date', endYMD)
        .in('user_id', userIds)
        .limit(50000);
      if (error) throw error;
      checks = (data ?? []) as DailyCheck[];
    }
  } catch {
    // Fallback local
    if (typeof window !== 'undefined') {
      for (const uid of userIds) {
        for (const ymd of days) {
          const raw = localStorage.getItem(`checks:${uid}:${ymd}`) || '[]';
          checks.push(...(JSON.parse(raw) as DailyCheck[]));
        }
      }
    }
  }

  const completedByUser = new Map<string, number>();
  for (const c of checks) {
    const key = `${c.user_id}|${c.task_key}|${c.date}`;
    if (!expectedKeys.has(key)) continue; // ignora marcados en días no activos
    completedByUser.set(c.user_id, (completedByUser.get(c.user_id) ?? 0) + 1);
  }

  // nombres
  const names = new Map<string, string>();
  defs.forEach(d => { if (d.user_id) names.set(d.user_id, d.assigneeName); });

  const result: Array<{ id: string; name: string; completed: number; total: number }> = [];
  for (const uid of userIds) {
    result.push({
      id: uid,
      name: names.get(uid) ?? uid,
      completed: completedByUser.get(uid) ?? 0,
      total: totalsByUser.get(uid) ?? 0,
    });
  }
  return result;
}
