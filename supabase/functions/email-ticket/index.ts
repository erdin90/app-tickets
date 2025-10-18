import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.json();

    const from = body.from || "unknown";
    const subject = body.subject || "Sin asunto";
    const text = body.text || "(Sin contenido)";
    const html = body.html || "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar usuario por email
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", from)
      .single();

    // Insertar ticket
    await supabase.from("tickets").insert({
      title: subject,
      description: html || text,
      created_by: profile?.id || null,
      source: "email",
      status: "pending",
    });

    return new Response("Ticket creado exitosamente", { status: 200 });
  } catch (error) {
    console.error("Error procesando correo:", error);
    return new Response("Error", { status: 500 });
  }
});
