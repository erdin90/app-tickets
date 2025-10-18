"use client";
import StatusBadge from "./StatusBadge";

type Ticket = {
  id:string|number;
  title:string;
  description?:string;
  status:"Abierto"|"Pendiente"|"Cerrado";
  createdAt:string; // ya formateado
  assignees?: {id:string; name:string}[];
  assigneeId?: string|null;
};

export default function TicketCard({
  ticket,
  onAssign,
  onDelete,
  onChangeStatus
}:{
  ticket:Ticket;
  onAssign:(id:string|number, assigneeId:string|null)=>void;
  onDelete:(id:string|number)=>void;
  onChangeStatus:(id:string|number, s:Ticket["status"])=>void;
}){
  return (
    <article className="ticket">
      <div className="ticket-head">
        <div>
          <div className="title">{ticket.title}</div>
          <div className="meta">{ticket.createdAt}</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <StatusBadge status={ticket.status}/>
          <select
            defaultValue={ticket.status}
            onChange={(e)=>onChangeStatus(ticket.id, e.target.value as Ticket["status"])}
          >
            <option>Abierto</option>
            <option>Pendiente</option>
            <option>Cerrado</option>
          </select>
          <button className="btn" onClick={()=>onDelete(ticket.id)}>Eliminar</button>
        </div>
      </div>

      {ticket.description && <p style={{margin:"6px 0 0"}}>{ticket.description}</p>}

      <div style={{display:"flex",gap:8,alignItems:"center",marginTop:10,flexWrap:"wrap"}}>
        <span className="meta">Asignar a:</span>
        <select
          defaultValue={ticket.assigneeId ?? ""}
          onChange={(e)=>onAssign(ticket.id, e.target.value || null)}
        >
          <option value="">— Sin asignar —</option>
          {ticket.assignees?.map(a=>(
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
    </article>
  );
}
