import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';
import {
  THEME,
  FONT_FILE_REGULAR,
  FONT_FILE_BOLD,
} from '../../common/theme/theme';

export interface ReceiptData {
  citeNom: string;
  villaNumero: string;
  villaRue?: string | null;
  mois: string;
  montant: number;
  canal: string;
  reference: string;
  dateConfirmation: Date;
  qrToken: string;
  verifyUrl: string;
}

const W = 520;
const H = 760;

@Injectable()
export class ReceiptImageService {
  async generateReceipt(data: ReceiptData): Promise<Buffer> {
    const qrPng = await QRCode.toBuffer(data.verifyUrl, { margin: 1, width: 132 });
    const qrB64 = `data:image/png;base64,${qrPng.toString('base64')}`;

    const svg = this.buildSvg(data, qrB64);
    const resvg = new Resvg(svg, {
      font: {
        fontFiles: [FONT_FILE_REGULAR, FONT_FILE_BOLD],
        loadSystemFonts: false,
        defaultFontFamily: 'Plus Jakarta Sans',
      },
      fitTo: { mode: 'width', value: W * 2 },
    });
    const png = resvg.render().asPng();
    return Buffer.from(png);
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private formatMois(mois: string): string {
    const [year, month] = mois.split('-');
    const names = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
    ];
    const idx = parseInt(month, 10) - 1;
    return names[idx] ? `${names[idx]} ${year}` : mois;
  }

  private buildSvg(data: ReceiptData, qrB64: string): string {
    const montantText = `${data.montant.toLocaleString('fr-FR')} FCFA`;
    const dateText = data.dateConfirmation.toLocaleString('fr-FR');
    const villaText = data.villaRue
      ? `${data.villaNumero} — ${data.villaRue}`
      : data.villaNumero;
    const canalLabel = (data.canal || 'PAIEMENT')
      .toLowerCase()
      .split('_')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
    const refShort = data.reference.slice(0, 8).toUpperCase();

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${THEME.primary}"/>
      <stop offset="100%" stop-color="${THEME.emerald}"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="${THEME.primary}" flood-opacity="0.14"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="${THEME.bg}"/>

  <!-- Header -->
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="20" fill="${THEME.surface}" filter="url(#shadow)"/>

  <rect x="28" y="28" width="${W - 56}" height="128" rx="20" fill="url(#brand)"/>
  <rect x="28" y="108" width="${W - 56}" height="48" fill="url(#brand)"/>

  <rect x="56" y="56" width="52" height="52" rx="14" fill="#FFFFFF" opacity="0.16"/>
  <rect x="60" y="60" width="44" height="44" rx="12" fill="#FFFFFF"/>
  <text x="82" y="91" font-family="Plus Jakarta Sans" font-size="26" font-weight="700" fill="${THEME.primary}" text-anchor="middle">M</text>
  <text x="124" y="84" font-family="Plus Jakarta Sans" font-size="22" font-weight="700" fill="#FFFFFF">MySyndic</text>
  <text x="124" y="104" font-family="Plus Jakarta Sans" font-size="9" font-weight="400" fill="#FFFFFF" opacity="0.85" letter-spacing="3">VIE DE CITÉ</text>

  <text x="${W - 56}" y="86" font-family="Plus Jakarta Sans" font-size="11" font-weight="400" fill="#FFFFFF" opacity="0.9" text-anchor="end">Reçu de paiement</text>

  <!-- Body -->
  <text x="56" y="222" font-family="Plus Jakarta Sans" font-size="13" font-weight="400" fill="${THEME.ink3}">CITÉ</text>
  <text x="56" y="246" font-family="Plus Jakarta Sans" font-size="15" font-weight="400" fill="${THEME.ink}">${this.escapeXml(data.citeNom)}</text>
  <line x1="56" y1="264" x2="${W - 56}" y2="264" stroke="${THEME.border}"/>

  <text x="56" y="296" font-family="Plus Jakarta Sans" font-size="13" font-weight="400" fill="${THEME.ink3}">VILLA</text>
  <text x="56" y="320" font-family="Plus Jakarta Sans" font-size="15" font-weight="400" fill="${THEME.ink}">${this.escapeXml(villaText)}</text>
  <line x1="56" y1="338" x2="${W - 56}" y2="338" stroke="${THEME.border}"/>

  <text x="56" y="370" font-family="Plus Jakarta Sans" font-size="13" font-weight="400" fill="${THEME.ink3}">MOIS</text>
  <text x="${W - 56}" y="370" font-family="Plus Jakarta Sans" font-size="13" font-weight="400" fill="${THEME.ink}" text-anchor="end">${this.formatMois(data.mois)}</text>

  <text x="56" y="404" font-family="Plus Jakarta Sans" font-size="13" font-weight="400" fill="${THEME.ink3}">MONTANT</text>
  <text x="${W - 56}" y="406" font-family="Plus Jakarta Sans" font-size="22" font-weight="700" fill="${THEME.primary}" text-anchor="end">${montantText}</text>

  <text x="56" y="438" font-family="Plus Jakarta Sans" font-size="13" font-weight="400" fill="${THEME.ink3}">CANAL</text>
  <text x="${W - 56}" y="438" font-family="Plus Jakarta Sans" font-size="13" font-weight="400" fill="${THEME.ink}" text-anchor="end">${this.escapeXml(canalLabel)}</text>

  <text x="56" y="472" font-family="Plus Jakarta Sans" font-size="13" font-weight="400" fill="${THEME.ink3}">RÉFÉRENCE</text>
  <text x="${W - 56}" y="472" font-family="Plus Jakarta Sans" font-size="12" font-weight="400" fill="${THEME.ink}" text-anchor="end">${this.escapeXml(refShort)}</text>

  <text x="56" y="506" font-family="Plus Jakarta Sans" font-size="13" font-weight="400" fill="${THEME.ink3}">CONFIRMÉ LE</text>
  <text x="${W - 56}" y="506" font-family="Plus Jakarta Sans" font-size="13" font-weight="400" fill="${THEME.ink}" text-anchor="end">${this.escapeXml(dateText)}</text>

  <!-- QR -->
  <image x="${W / 2 - 66}" y="540" width="132" height="132" href="${qrB64}"/>
  <text x="${W / 2}" y="700" font-family="Plus Jakarta Sans" font-size="9" font-weight="400" fill="${THEME.ink3}" text-anchor="middle">${this.escapeXml(data.verifyUrl)}</text>
</svg>`;
  }
}
