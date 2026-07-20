import { Module } from "@nestjs/common";
import { DocumentsService } from "./application/documents.service";
import { DOCUMENT_REPOSITORY } from "./domain/document.repository";
import { PrismaDocumentRepository } from "./infrastructure/prisma-document.repository";
import { DocumentsController } from "./presentation/documents.controller";

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
  ],
})
export class DocumentModule {}
