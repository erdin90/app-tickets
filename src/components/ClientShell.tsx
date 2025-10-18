'use client';

import { UIProvider } from '@/providers/ui';
import AppBar from '@/components/AppBar';

export default function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <UIProvider>
      <AppBar />
      {children}
    </UIProvider>
  );
}
