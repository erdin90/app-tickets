'use client';

import { usePathname } from 'next/navigation';
import { getSectionTitle } from '@/lib/sections';

export default function HeaderTitle() {
  const pathname = usePathname() || '/';
  const title = getSectionTitle(pathname);

  return (
    <span className="font-semibold tracking-tight">
      {title}
    </span>
  );
}
