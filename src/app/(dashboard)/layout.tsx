// app/(dashboard)/layout.tsx
'use client';
import AppChrome from '@/components/AppChrome';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppChrome>{children}</AppChrome>;
}
