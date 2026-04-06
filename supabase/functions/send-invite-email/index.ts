import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// App URL for invite links (set in Supabase Edge Function secrets)
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:5173";

interface WebhookPayload {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    coterie_id: string;
    invited_by: string;
    email: string;
    token: string;
    status: string;
  };
}

serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json();

    // Only handle new pending invitations
    if (payload.record.status !== "pending") {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch coterie name
    const { data: coterie } = await supabase
      .from("coteries")
      .select("name")
      .eq("id", payload.record.coterie_id)
      .single();

    // Fetch sender name
    const { data: sender } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", payload.record.invited_by)
      .single();

    const senderName = sender?.display_name || "Someone";
    const coterieName = coterie?.name || "a coterie";
    const inviteUrl = `${APP_URL}/invite/${payload.record.token}`;

    // Send email via Resend
    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY not set — logging email instead:");
      console.log(`To: ${payload.record.email}`);
      console.log(`Subject: ${senderName} invited you to join ${coterieName} on Coterie`);
      console.log(`Link: ${inviteUrl}`);
      return new Response(JSON.stringify({ logged: true }), { status: 200 });
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Coterie <invites@coterie.app>",
        to: [payload.record.email],
        subject: `${senderName} invited you to join ${coterieName} on Coterie`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <h2 style="color: #d4b468; font-size: 24px; margin-bottom: 4px;">Coterie</h2>
            <p style="color: #918888; font-size: 13px; margin-bottom: 24px;">Map your professional world.</p>

            <p style="font-size: 15px; color: #e0dcd8; line-height: 1.6;">
              <strong>${senderName}</strong> has invited you to join the
              <strong>${coterieName}</strong> coterie — a trusted circle for
              sharing professional intel.
            </p>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${inviteUrl}"
                 style="background: #d4b468; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
                View Invitation
              </a>
            </div>

            <p style="font-size: 13px; color: #918888; line-height: 1.5;">
              Coterie lets you visually map the people and organizations in your
              world. Try it free for 2 months — no credit card needed.
            </p>

            <p style="font-size: 11px; color: #666; margin-top: 24px;">
              If you weren't expecting this invitation, you can safely ignore this email.
            </p>
          </div>
        `,
      }),
    });

    const emailResult = await emailResponse.json();

    return new Response(JSON.stringify({ sent: true, result: emailResult }), {
      status: 200,
    });
  } catch (error) {
    console.error("Error sending invite email:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500 }
    );
  }
});
