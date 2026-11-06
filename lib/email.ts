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
  sendInvitationEmail(params: SendInvitationEmailParams): Promise<EmailResult>;
}

class DevelopmentEmailProvider implements EmailProvider {
  async sendInvitationEmail(params: SendInvitationEmailParams): Promise<EmailResult> {
    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${appUrl}/invitations/accept?token=${params.inviteToken}`;

    console.log("==================================================");
    console.log("📧 [DEV EMAIL] ORGANIZATION INVITATION SENT");
    console.log("--------------------------------------------------");
    console.log(`To:               ${params.to}`);
    console.log(`Organization:     ${params.organizationName}`);
    console.log(`Invited By:       ${params.inviterName}`);
    console.log(`Assigned Role:    ${params.role}`);
    console.log(`Expires At:       ${params.expiresAt.toISOString()}`);
    console.log(`Invitation Link:  ${inviteUrl}`);
    console.log("==================================================");

    return {
      success: true,
      messageId: `dev-msg-${Date.now()}`,
    };
  }
}

export const emailService: EmailProvider = new DevelopmentEmailProvider();

