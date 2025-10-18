import TicketsSidebar from "./TicketsSidebar";
import TicketsTopbar from "./TicketsTopbar";

export default function TicketsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh bg-white text-neutral-900">
      <TicketsSidebar />
      <div className="flex-1 min-w-0">
        <TicketsTopbar />
        <main className="mx-auto max-w-screen-2xl p-4">{children}</main>
      </div>
    </div>
  );
}
