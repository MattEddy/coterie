import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("SUPABASE_WEBHOOK_SECRET");

// App URL for invite links (set in Supabase Edge Function secrets)
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:5173";

interface WebhookPayload {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    map_id: string;
    invited_by: string;
    email: string;
    token: string;
    status: string;
  };
}

async function verifyWebhookSignature(req: Request, body: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // Skip verification if secret not configured
  const signature = req.headers.get("x-supabase-signature");
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedSig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signature === expectedHex;
}

serve(async (req) => {
  try {
    const body = await req.text();

    // Verify webhook signature
    if (!(await verifyWebhookSignature(req, body))) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
      });
    }

    const payload: WebhookPayload = JSON.parse(body);

    // Only handle new pending invitations
    if (payload.record.status !== "pending") {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch map name
    const { data: map, error: mapError } = await supabase
      .from("maps")
      .select("name")
      .eq("id", payload.record.map_id)
      .single();

    if (mapError) {
      console.error("Map not found:", mapError);
      return new Response(
        JSON.stringify({ error: "Map not found" }),
        { status: 404 },
      );
    }

    // Fetch sender name
    const { data: sender } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", payload.record.invited_by)
      .single();

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const senderName = esc(sender?.display_name || "Someone");
    const mapName = esc(map?.name || "a shared map");
    const inviteUrl = `${APP_URL}/invite/${payload.record.token}`;

    // Send email via Resend
    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY not set — logging email instead:");
      console.log(`To: ${payload.record.email}`);
      console.log(
        `Subject: ${senderName} invited you to join "${mapName}" on Coterie`,
      );
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
        subject: `${senderName} invited you to join "${mapName}" on Coterie`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <h2 style="color: #d4b468; font-size: 24px; margin-bottom: 4px;">Coterie</h2>
            <p style="color: #918888; font-size: 13px; margin-bottom: 24px;">Map your professional world.</p>

            <p style="font-size: 15px; color: #e0dcd8; line-height: 1.6;">
              <strong>${senderName}</strong> has invited you to join
              <strong>${mapName}</strong> — a shared map for tracking
              professional intel together.
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

    if (!emailResponse.ok) {
      const errorBody = await emailResponse.text();
      console.error("Resend API error:", emailResponse.status, errorBody);
      return new Response(
        JSON.stringify({ error: `Email send failed: ${emailResponse.status}` }),
        { status: 500 },
      );
    }

    const emailResult = await emailResponse.json();

    return new Response(JSON.stringify({ sent: true, result: emailResult }), {
      status: 200,
    });
  } catch (error) {
    console.error("Error sending invite email:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500 },
    );
  }
});
