export interface SendInvitationEmailParams {
  to: string;
  organizationName: string;
  inviterName: string;
  role: string;
  inviteToken: string;
  expiresAt: Date;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  name: string;
  sendInvitationEmail(params: SendInvitationEmailParams): Promise<EmailResult>;
}

/**
 * Resend Email Provider (via Resend REST API)
 * Requires RESEND_API_KEY and optionally EMAIL_FROM (defaults to onboarding@resend.dev)
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private apiKey: string;
  private from: string;

  constructor(apiKey: string, from?: string) {
    this.apiKey = apiKey;
    this.from = from || process.env.EMAIL_FROM || "ATLAS Analytics <onboarding@resend.dev>";
  }

  async sendInvitationEmail(params: SendInvitationEmailParams): Promise<EmailResult> {
    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${appUrl}/invitations/accept?token=${encodeURIComponent(params.inviteToken)}`;
    const expiresFormatted = params.expiresAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

    const subject = `Invitation to join ${params.organizationName} on ATLAS Analytics`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">You've been invited to ATLAS</h2>
        <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          <strong>${escapeHtml(params.inviterName)}</strong> has invited you to join <strong>${escapeHtml(params.organizationName)}</strong> as a <strong>${escapeHtml(params.role)}</strong>.
        </p>
        <div style="margin: 32px 0;">
          <a href="${inviteUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
            Accept Invitation
          </a>
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
          This invitation link will expire on <strong>${expiresFormatted} (UTC)</strong>.
          If you were not expecting this invitation, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 11px; color: #94a3b8;">
          ATLAS — Multi-Tenant Product Analytics Platform
        </p>
      </div>
    `;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [params.to],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        return {
          success: false,
          error: `Resend API error (${response.status}): ${JSON.stringify(errorData)}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        messageId: data.id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error sending via Resend",
      };
    }
  }
}

/**
 * Development Safe Console Provider
 * Never leaks the full raw token in production logs.
 */
export class DevelopmentEmailProvider implements EmailProvider {
  readonly name = "development";

  async sendInvitationEmail(params: SendInvitationEmailParams): Promise<EmailResult> {
    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const maskedToken = `${params.inviteToken.slice(0, 8)}...[REDACTED]`;
    const inviteUrl = `${appUrl}/invitations/accept?token=${encodeURIComponent(params.inviteToken)}`;

    if (process.env.NODE_ENV !== "test") {
      console.info("==================================================");
      console.info("📧 [EMAIL SERVICE - DEV PROVIDER] INVITATION DISPATCHED");
      console.info("--------------------------------------------------");
      console.info(`To:               ${params.to}`);
      console.info(`Organization:     ${params.organizationName}`);
      console.info(`Invited By:       ${params.inviterName}`);
      console.info(`Assigned Role:    ${params.role}`);
      console.info(`Token (Masked):   ${maskedToken}`);
      console.info(`Expires At:       ${params.expiresAt.toISOString()}`);
      // Only print active link in development mode
      if (process.env.NODE_ENV === "development") {
        console.info(`Invitation Link:  ${inviteUrl}`);
      }
      console.info("==================================================");
    }

    return {
      success: true,
      messageId: `dev-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function createEmailProvider(): EmailProvider {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    return new ResendEmailProvider(resendApiKey, process.env.EMAIL_FROM);
  }

  return new DevelopmentEmailProvider();
}

export const emailService: EmailProvider = createEmailProvider();
