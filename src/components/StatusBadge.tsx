"use client";
export default function StatusBadge({ status }:{ status:"Abierto"|"Pendiente"|"Cerrado" }) {
  const cls = status==="Cerrado" ? "badge badge-closed" : status==="Pendiente" ? "badge badge-pending" : "badge badge-open";
  return <span className={cls}>{status}</span>;
}
