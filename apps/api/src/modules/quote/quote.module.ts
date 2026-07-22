import { Module } from "@nestjs/common";
import { QuoteService } from "./application/quote.service";
import { QUOTE_REPOSITORY } from "./domain/quote.repository";
import { PrismaQuoteRepository } from "./infrastructure/prisma-quote.repository";
import { QuoteController } from "./presentation/quote.controller";

@Module({
  controllers: [QuoteController],
  providers: [QuoteService, { provide: QUOTE_REPOSITORY, useClass: PrismaQuoteRepository }],
})
export class QuoteModule {}
