import { Module } from '@nestjs/common';
import { PaiementController } from './paiement.controller';
import { PaiementService } from './paiement.service';
import { PaystackClientService } from './paystack-client.service';
import { ReceiptImageService } from './receipt-image.service';
import { ExcelExportService } from './excel-export.service';

@Module({
  controllers: [PaiementController],
  providers: [
    PaiementService,
    PaystackClientService,
    ReceiptImageService,
    ExcelExportService,
  ],
  exports: [PaiementService, ReceiptImageService, PaystackClientService],
})
export class PaiementModule {}