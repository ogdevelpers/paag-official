import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { PaymentService } from "./payment.service";
import { PaymentsController } from "./payments.controller";

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentService],
})
export class PaymentsModule {}
