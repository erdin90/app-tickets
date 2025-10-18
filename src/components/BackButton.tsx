// src/components/BackButton.tsx
'use client';
import { useRouter } from 'next/navigation';

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="px-3 py-1 rounded border bg-gray-100 hover:bg-gray-200 text-sm transition"
    >
      ← Volver
    </button>
  );
}
