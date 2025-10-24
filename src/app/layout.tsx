import './globals.css';
import type { Metadata } from 'next';
import { UIProvider } from '@/providers/ui';
import VersionBanner from '@/components/VersionBanner';
import AppToaster from '@/components/Toaster';

export const metadata: Metadata = {
  title: 'IT System',
  description: 'Support & KB',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-white text-black antialiased">
        <UIProvider>
          {children}
          <AppToaster />
          <VersionBanner align="container" vertical="bottom" />
        </UIProvider>
      </body>
    </html>
  );
}
