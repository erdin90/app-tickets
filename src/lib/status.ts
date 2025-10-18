// src/lib/status.ts
export type TicketStatus = 'open' | 'in_progress' | 'on_hold' | 'completed';

export const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'open',         label: 'Abierto' },
  { value: 'in_progress',  label: 'En progreso' },
  { value: 'on_hold',      label: 'En espera' },
  { value: 'completed',    label: 'Completado' },
];

export const statusLabel = (v: string) =>
  STATUS_OPTIONS.find(o => o.value === v)?.label ?? v;
