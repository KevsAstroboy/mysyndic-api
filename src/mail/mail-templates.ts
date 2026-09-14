import { THEME } from '../common/theme/theme';

export const MAIL_THEME = THEME;

export const FONT_STACK = THEME.fontStack;
export const MONO_STACK = THEME.monoStack;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function logoBlock(): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td align="center" style="padding:32px 24px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td align="center" width="36" height="36" style="width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg,#0D6E5A,#00A87C); text-align:center;">
                <span style="display:block; font-family:${FONT_STACK}; font-size:14px; font-weight:800; color:#FFFFFF; line-height:36px;">M</span>
              </td>
              <td style="padding-left:10px;">
                <span style="font-family:${FONT_STACK}; font-size:16px; font-weight:800; color:#0F1E2D; letter-spacing:-.3px;">MySyndic</span>
                <br/>
                <span style="font-family:${FONT_STACK}; font-size:10px; font-weight:600; color:#8BA4B8; letter-spacing:.4px;">VIE DE CITÉ</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

interface MailLayoutParams {
  appName: string;
  preheader?: string;
  body: string;
}

function renderMailLayout({ appName, preheader, body }: MailLayoutParams): string {
  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <meta name="x-apple-disable-message-reformatting"/>
    <title>${escapeHtml(appName)}</title>
  </head>
  <body style="margin:0; padding:0; background:${MAIL_THEME.bg}; -webkit-text-size-adjust:100%; word-spacing:normal;" width="100%">
    ${
      preheader
        ? `<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; color:${MAIL_THEME.bg}; line-height:1px; max-height:0; max-width:0; opacity:0;">${preheader}</div>`
        : ''
    }
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${MAIL_THEME.bg};">
      <tr>
        <td align="center" style="padding:0 16px 32px;">
          ${logoBlock()}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="width:100%; max-width:480px; background:${MAIL_THEME.surface}; border-radius:${MAIL_THEME.radiusMd}; border:1px solid ${MAIL_THEME.border}; box-shadow:${MAIL_THEME.shadowCard}; border-collapse:separate!important;">
            <tr>
              <td style="padding:28px 28px 24px; font-family:${FONT_STACK}; color:${MAIL_THEME.ink};">
                ${body}
              </td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="width:100%; max-width:480px;">
            <tr>
              <td align="center" style="padding:20px 16px 0; font-family:${FONT_STACK}; font-size:11px; color:${MAIL_THEME.ink3}; line-height:1.6;">
                ${escapeHtml(appName)} — Gestion de cité résidentielle<br/>
                Posée par <a href="mailto:support@mysyndic.ci" style="color:${MAIL_THEME.primary}; text-decoration:none;">support@mysyndic.ci</a> — confidentiel
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderOtpEmail(appName: string, code: string): string {
  return renderMailLayout({
    appName,
    preheader: `Votre code de vérification ${appName} : ${code}`,
    body: `
      <h1 style="margin:0 0 8px; font-size:18px; line-height:1.3; font-weight:800; color:${MAIL_THEME.ink}; letter-spacing:-.3px;">Vérifier votre identité</h1>
      <p style="margin:0 0 18px; font-size:14px; line-height:1.6; color:${MAIL_THEME.ink2};">
        Utilisez le code ci-dessous pour terminer votre connexion sur <strong style="color:${MAIL_THEME.ink};">${escapeHtml(appName)}</strong>.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="background:${MAIL_THEME.surface2}; border-radius:${MAIL_THEME.radiusSm}; padding:16px; font-family:${MONO_STACK}; font-size:28px; font-weight:bold; letter-spacing:6px; color:${MAIL_THEME.primary};">${escapeHtml(code)}</td>
        </tr>
      </table>
      <p style="margin:16px 0 0; font-size:12px; line-height:1.6; color:${MAIL_THEME.ink3};">
        Ce code expire dans <strong style="color:${MAIL_THEME.ink2};">10 minutes</strong>.
        Si vous n'avez pas demandé ce code, ignorez cet email.
      </p>
    `,
  });
}

export function renderWelcomeStaffEmail(
  appName: string,
  email: string,
  tempPassword: string,
  appUrl: string,
): string {
  return renderMailLayout({
    appName,
    preheader: `Votre compte ${appName} a été créé`,
    body: `
      <h1 style="margin:0 0 8px; font-size:18px; line-height:1.3; font-weight:800; color:${MAIL_THEME.ink}; letter-spacing:-.3px;">Bienvenue sur ${escapeHtml(appName)}</h1>
      <p style="margin:0 0 18px; font-size:14px; line-height:1.6; color:${MAIL_THEME.ink2};">
        Votre compte a été créé par un administrateur. Connectez-vous avec les identifiants ci-dessous.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; border:1px solid ${MAIL_THEME.border}; border-radius:${MAIL_THEME.radiusSm};">
        <tr>
          <td style="padding:12px 16px; font-family:${FONT_STACK}; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; color:${MAIL_THEME.ink3}; border-bottom:1px solid ${MAIL_THEME.border};">Email</td>
          <td style="padding:12px 16px; font-family:${FONT_STACK}; font-size:13px; font-weight:600; color:${MAIL_THEME.ink}; border-bottom:1px solid ${MAIL_THEME.border};">${escapeHtml(email)}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px; font-family:${FONT_STACK}; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; color:${MAIL_THEME.ink3};">Mot de passe</td>
          <td style="padding:12px 16px; font-family:${MONO_STACK}; font-size:13px; font-weight:700; color:${MAIL_THEME.primary};">${escapeHtml(tempPassword)}</td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:18px;">
        <tr>
          <td>
            <a href="${escapeAttr(appUrl)}" target="_blank" style="display:inline-block; padding:9px 16px; background:${MAIL_THEME.primary}; color:#FFFFFF; font-size:13px; font-weight:700; text-decoration:none; border-radius:${MAIL_THEME.radiusSm}; box-shadow:0 2px 8px rgba(13,110,90,.25); font-family:${FONT_STACK};">Se connecter</a>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0; font-size:12px; line-height:1.6; color:${MAIL_THEME.ink3};">
        Vous devrez changer ce mot de passe dès votre première connexion.
      </p>
    `,
  });
}