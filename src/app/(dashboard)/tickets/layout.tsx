// src/app/tickets/layout.tsx
'use client';

import Link from 'next/link';

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-gray-100 dark:bg-neutral-900 p-4 border-b md:border-r">
        <nav className="flex flex-col gap-2">
          <Link
            href="/tickets/board"
            className="px-3 py-2 rounded hover:bg-gray-200 dark:hover:bg-neutral-800"
          >
            Tablero
          </Link>
          <Link
            href="/tickets/new"
            className="px-3 py-2 rounded hover:bg-gray-200 dark:hover:bg-neutral-800"
          >
            Nuevo Ticket
          </Link>
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 overflow-y-auto">{children}</main>
    </div>
  );
}
