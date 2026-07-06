import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, Transporter } from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Envoi d'emails via SMTP (SMTP_URL). Sans SMTP_URL configurée
 * (poste de dev), le contenu est journalisé au lieu d'être envoyé —
 * comportement documenté, jamais actif si SMTP_URL est définie.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const smtpUrl = config.get<string>("SMTP_URL");
    this.transporter = smtpUrl ? createTransport(smtpUrl) : null;
    this.from = config.get<string>("SMTP_FROM") ?? "OpenPPM <no-reply@openppm.local>";
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP non configurée — email non envoyé. À: ${message.to} — Sujet: ${message.subject} — Corps: ${message.text}`,
      );
      return;
    }
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
