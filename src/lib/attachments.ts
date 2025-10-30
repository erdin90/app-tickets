// src/lib/attachments.ts
import { supabase } from './supabase';

export type Attachment = {
  id: string;
  ticket_id: string;
  path: string;
  name: string;
  mime_type: string | null;
  size: number | null;
  uploaded_by: string | null;
  created_at: string;
};

const BUCKET = 'ticket-files';

export async function listAttachments(ticketId: string) {
  const { data, error } = await supabase
    .from('ticket_attachments')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false });

  return { data: (data as Attachment[]) ?? [], error };
}

export async function addAttachmentRecord(input: {
  ticket_id: string;
  path: string;
  name: string;
  mime?: string | null;
  size?: number | null;
  uploaded_by?: string | null;
}) {
  const { data, error } = await supabase
    .from('ticket_attachments')
    .insert([{
      ticket_id: input.ticket_id,
      path: input.path,
      name: input.name,
      mime_type: input.mime ?? null,
      size: input.size ?? null,
      uploaded_by: input.uploaded_by ?? null,
    }])
    .select()
    .single();

  return { data: data as Attachment | null, error };
}

export async function removeAttachment(id: string, path: string) {
  // 1) borrar del storage
  const { error: storErr } = await supabase.storage.from(BUCKET).remove([path]);
  // 2) borrar el registro (aunque falle el storage intentamos limpiar metadata)
  const { error: rowErr } = await supabase.from('ticket_attachments').delete().eq('id', id);
  return { error: storErr || rowErr || null };
}

export function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
