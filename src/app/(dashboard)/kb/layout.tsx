// src/app/kb/layout.tsx
'use client';
import AuthGuard from '@/components/AuthGuard';

export default function KBLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
