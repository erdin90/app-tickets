// src/lib/kb.ts
import { supabase } from '@/lib/supabase';

export type KBStatus = 'draft' | 'published' | 'archived';

export interface KBArticle {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  status: KBStatus;
  category: string | null;
  tags: string[] | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  views: number | null;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .substring(0, 120);
}

/** Crea un artículo de KB y devuelve el registro completo (incluye slug). */
export async function createKB(input: {
  title: string;
  summary?: string;
  content: string;
  status?: KBStatus;
  category?: string;
  tags?: string[];
}) {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return { data: null as KBArticle | null, error: new Error('No autenticado') };

  const baseSlug = slugify(input.title || 'kb');
  let finalSlug = baseSlug;

  // Evitar colisiones de slug
  for (let i = 1; i < 50; i++) {
    const { data: exists, error: e1 } = await supabase
      .from('kb_articles')
      .select('id')
      .eq('slug', finalSlug)
      .maybeSingle();
    if (e1) return { data: null as KBArticle | null, error: e1 };
    if (!exists) break;
    finalSlug = `${baseSlug}-${i}`;
  }

  const payload = {
    slug: finalSlug,
    title: input.title.trim(),
    summary: input.summary?.trim() ?? null,
    content: input.content,
    status: input.status ?? 'draft',
    category: input.category?.trim() || null,
    tags: (input.tags?.length ? input.tags : []) as string[],
    created_by: userId,
  };

  const { data, error } = await supabase
    .from('kb_articles')
    .insert(payload)
    .select(
      'id, slug, title, summary, content, status, category, tags, created_by, created_at, updated_at, views'
    )
    .single();

  return { data: (data ?? null) as KBArticle | null, error };
}

/** Actualiza por slug y retorna el artículo actualizado. */
export async function updateKBBySlug(slug: string, patch: Partial<Pick<
  KBArticle, 'title' | 'summary' | 'content' | 'status' | 'category' | 'tags'
>>) {
  const { data, error } = await supabase
    .from('kb_articles')
    .update(patch)
    .eq('slug', slug)
    .select('id, slug, title, summary, content, status, category, tags, created_by, created_at, updated_at, views')
    .maybeSingle();

  return { data: (data ?? null) as KBArticle | null, error };
}

/** Obtiene un artículo por slug. */
export async function getKBBySlug(slug: string) {
  const { data, error } = await supabase
    .from('kb_articles')
    .select('id, slug, title, summary, content, status, category, tags, created_by, created_at, updated_at, views')
    .eq('slug', slug)
    .maybeSingle();

  return { data: (data ?? null) as KBArticle | null, error };
}

/** Incrementa el contador de vistas de un artículo. */
export async function incrementKBViewsBySlug(slug: string) {
  // Usa RPC si la tienes; aquí hago un update simple con sum.
  const { data, error } = await supabase.rpc('kb_increment_views', { p_slug: slug });
  // Si NO tienes la función RPC, descomenta este fallback:
  // const { data: row } = await supabase.from('kb_articles').select('views').eq('slug', slug).maybeSingle();
  // const current = row?.views ?? 0;
  // const { data, error } = await supabase.from('kb_articles').update({ views: current + 1 }).eq('slug', slug).select('views').maybeSingle();
  return { data, error };
}

/** Listado con búsqueda, filtro de estado y paginación. */
export async function listKB({
  q,
  status = 'all',
  page = 1,
  pageSize = 20,
}: {
  q?: string;
  status?: KBStatus | 'all';
  page?: number;
  pageSize?: number;
}) {
  let query = supabase
    .from('kb_articles')
    .select('id, slug, title, summary, content, status, category, tags, created_by, created_at, updated_at, views', { count: 'exact' })
    .order('updated_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    // filtro simple: título + summary + content
    query = query.or(`title.ilike.${like},summary.ilike.${like},content.ilike.${like}`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  return {
    data: (data ?? []) as KBArticle[],
    total: count ?? 0,
    error,
  };
}

export async function deleteKBById(id: string) {
  const { error } = await supabase
    .from('kb_articles')
    .delete()
    .eq('id', id);

  return { error };
}
