'use client';
import { supabase } from './supabase';

const BUCKET = 'attachments';

export async function uploadAttachment(ticketId: string, file: File) {
  const path = `${ticketId}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function listAttachments(ticketId: string) {
  const { data, error } = await supabase.storage.from(BUCKET).list(`${ticketId}`, { limit: 100, offset: 0 });
  if (error) throw error;
  const files = data ?? [];
  const result: { name: string; path: string; url: string }[] = [];
  for (const f of files) {
    const path = `${ticketId}/${f.name}`;
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    result.push({ name: f.name, path, url: signed?.signedUrl ?? '#' });
  }
  return result;
}

export async function removeAttachment(path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function removeAllAttachments(ticketId: string) {
  const { data, error } = await supabase.storage.from(BUCKET).list(`${ticketId}`, { limit: 100, offset: 0 });
  if (error) throw error;
  if (!data || data.length === 0) return;
  const paths = data.map(f => `${ticketId}/${f.name}`);
  const { error: delErr } = await supabase.storage.from(BUCKET).remove(paths);
  if (delErr) throw delErr;
}
