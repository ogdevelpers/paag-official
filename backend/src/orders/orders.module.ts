import { Module } from "@nestjs/common";
import { StudioModule } from "../studio/studio.module";
import { OrderService } from "./order.service";
import { OrdersController } from "./orders.controller";

@Module({
  imports: [StudioModule],
  controllers: [OrdersController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrdersModule {}
