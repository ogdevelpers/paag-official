import { Module } from "@nestjs/common";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";
import { AddressService } from "./address.service";
import { ShoppingService } from "./shopping.service";
import { VerificationService } from "./verification.service";

@Module({
  controllers: [AccountController],
  providers: [AccountService, AddressService, ShoppingService, VerificationService],
  exports: [AccountService, AddressService, ShoppingService, VerificationService],
})
export class AccountModule {}
