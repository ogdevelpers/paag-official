import { Module } from "@nestjs/common";
import { StudioModule } from "../studio/studio.module";
import { CatalogService } from "./catalog.service";
import { ProductsController } from "./products.controller";

@Module({
  imports: [StudioModule],
  controllers: [ProductsController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
