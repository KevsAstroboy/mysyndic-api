import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { renderOtpEmail, renderWelcomeStaffEmail } from './mail-templates';

const SMTP_IPS: Record<string, string> = {
  'smtp.gmail.com': '142.250.141.109',
  'smtp-relay.brevo.com': '172.246.243.66',
  'smtp.sendgrid.net': '159.183.177.31',
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  private buildTransporter() {
    const host = this.config.getOrThrow('MAIL_HOST');
    const ip = SMTP_IPS[host] ?? host;
    return nodemailer.createTransport({
      host: ip,
      port: parseInt(this.config.getOrThrow('MAIL_PORT'), 10),
      secure: false,
      tls: { servername: host },
      auth: {
        user: this.config.getOrThrow('MAIL_USER'),
        pass: this.config.getOrThrow('MAIL_PASS'),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }

  async sendOtpEmail(email: string, code: string): Promise<void> {
    const appName = this.config.get('APP_NAME') || 'MySyndic';
    const from =
      this.config.get('MAIL_FROM') || `${appName} <noreply@mysyndic.ci>`;

    const transporter = this.buildTransporter();

    await transporter.sendMail({
      from,
      to: email,
      subject: `${appName} — Code de vérification`,
      html: renderOtpEmail(appName, code),
    });

    this.logger.log(`OTP email sent to ${email}`);
  }

  async sendWelcomeStaffEmail(
    email: string,
    tempPassword: string,
    appUrl: string,
  ): Promise<void> {
    const appName = this.config.get('APP_NAME') || 'MySyndic';
    const from =
      this.config.get('MAIL_FROM') || `${appName} <noreply@mysyndic.ci>`;

    const transporter = this.buildTransporter();

    await transporter.sendMail({
      from,
      to: email,
      subject: `${appName} — Votre compte a été créé`,
      html: renderWelcomeStaffEmail(appName, email, tempPassword, appUrl),
    });

    this.logger.log(`Welcome email sent to ${email}`);
  }
}