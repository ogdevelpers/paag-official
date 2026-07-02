import { Inject, Injectable } from "@nestjs/common";
import type { Product } from "../domain";
import { filterCatalogProducts as domainFilterCatalogProducts } from "../domain/catalog";
import { filterLiveProducts, isLiveCategory } from "../domain/store-config";
import { COMMERCE_REPOSITORY, type CommerceRepository } from "../commerce/commerce.repository";

@Injectable()
export class CatalogService {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly repository: CommerceRepository,
  ) {}

  async listCatalogProducts() {
    return filterLiveProducts(await this.repository.listProducts());
  }

  async listStudioProducts() {
    return this.repository.listAllProducts();
  }

  async getCatalogProduct(slug: string) {
    const product = await this.repository.getProduct(slug);
    if (!product || product.status !== "live" || !isLiveCategory(product.category)) {
      return null;
    }

    return product;
  }

  async getProductDetail(slug: string) {
    const product = await this.getCatalogProduct(slug);
    if (!product) {
      return null;
    }

    const recommendations = (await this.listCatalogProducts())
      .filter((item) => item.slug !== product.slug)
      .slice(0, 4);

    return { product, recommendations };
  }

  filterCatalogProducts(
    products: Product[],
    filters: Parameters<typeof domainFilterCatalogProducts>[1],
  ) {
    return domainFilterCatalogProducts(products, filters);
  }
}
