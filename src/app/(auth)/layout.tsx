// app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // NO metas wrappers que centren; tu página de login ya maneja su layout
  return <>{children}</>;
}
