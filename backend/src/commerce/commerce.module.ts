import { Global, Module } from "@nestjs/common";
import { PrismaClient } from "../database";
import { COMMERCE_REPOSITORY, PrismaCommerceRepository } from "./commerce.repository";

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useFactory: () => new PrismaClient(),
    },
    PrismaCommerceRepository,
    {
      provide: COMMERCE_REPOSITORY,
      useExisting: PrismaCommerceRepository,
    },
  ],
  exports: [PrismaClient, COMMERCE_REPOSITORY, PrismaCommerceRepository],
})
export class CommerceModule {}
