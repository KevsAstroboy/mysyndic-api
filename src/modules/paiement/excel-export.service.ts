import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface PaiementExportRow {
  villa_numero: string;
  villa_rue?: string | null;
  mois: string;
  montant: number;
  canal: string;
  statut: string;
  date: Date;
  saisi_par?: string | null;
}

const FONT_NAME = 'Tw Cen MT';

const COLORS = {
  primary: '0D6E5A',
  primaryDark: '083D31',
  border: 'E2EAE7',
  surface2: 'F0F3F0',
  ink: '0F1E2D',
  ink3: '8BA4B8',
};

@Injectable()
export class ExcelExportService {
  async exportPaiements(rows: PaiementExportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MySyndic';
    const sheet = workbook.addWorksheet('Paiements', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: 'Villa', key: 'villa_numero', width: 12 },
      { header: 'Rue', key: 'villa_rue', width: 24 },
      { header: 'Mois', key: 'mois', width: 14 },
      { header: 'Montant', key: 'montant', width: 14 },
      { header: 'Canal', key: 'canal', width: 18 },
      { header: 'Statut', key: 'statut', width: 14 },
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Saisi Par', key: 'saisi_par', width: 20 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${COLORS.primary}` },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    for (const r of rows) {
      sheet.addRow({
        villa_numero: r.villa_numero,
        villa_rue: r.villa_rue ?? '',
        mois: r.mois,
        montant: r.montant,
        canal: r.canal,
        statut: r.statut,
        date: r.date.toLocaleString('fr-FR'),
        saisi_par: r.saisi_par ?? '',
      });
    }

    const dataStart = 2;
    const dataEnd = sheet.rowCount;
    for (let i = dataStart; i <= dataEnd; i++) {
      const row = sheet.getRow(i);
      row.eachCell((cell, col) => {
        cell.font = { name: FONT_NAME, size: 11, color: { argb: `FF${COLORS.ink}` } };
        cell.alignment = { vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: `FF${COLORS.border}` } } };
        if (i % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: `FF${COLORS.surface2}` },
          };
        }
        if (col === 4) {
          cell.numFmt = '#,##0';
        }
      });
    }

    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: dataEnd, column: sheet.columnCount } };

    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }
}