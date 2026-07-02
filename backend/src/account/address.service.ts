import { Inject, Injectable } from "@nestjs/common";
import type { CustomerAddress } from "../domain";
import { parseAddressPayload } from "../common/validation/input";
import { COMMERCE_REPOSITORY, type CommerceRepository } from "../commerce/commerce.repository";

const MAX_ADDRESSES = 20;

type AddressPayload = {
  label?: string;
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  isDefault?: boolean;
};

@Injectable()
export class AddressService {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly repository: CommerceRepository,
  ) {}

  async listCustomerAddresses(customerId: string) {
    return this.repository.listCustomerAddresses(customerId);
  }

  async createCustomerAddress(customerId: string, payload: AddressPayload) {
    const parsed = parseAddressPayload(payload);
    if (parsed.error || !parsed.address) {
      return { error: parsed.error || "Invalid address.", status: 400 };
    }

    const existing = await this.repository.listCustomerAddresses(customerId);
    if (existing.length >= MAX_ADDRESSES) {
      return { error: `You can save up to ${MAX_ADDRESSES} addresses.`, status: 400 };
    }

    const address = await this.repository.createCustomerAddress({
      customerId,
      ...parsed.address,
      isDefault: payload.isDefault || existing.length === 0,
    });

    return { address, status: 201 };
  }

  async updateCustomerAddress(
    customerId: string,
    addressId: string,
    payload: AddressPayload,
  ) {
    const current = await this.repository.getCustomerAddress(customerId, addressId);
    if (!current) {
      return { error: "Address not found.", status: 404 };
    }

    const parsed = parseAddressPayload({
      label: payload.label ?? current.label,
      name: payload.name ?? current.name,
      phone: payload.phone ?? current.phone,
      address: payload.address ?? current.address,
      city: payload.city ?? current.city,
    });

    if (parsed.error || !parsed.address) {
      return { error: parsed.error || "Invalid address.", status: 400 };
    }

    const address = await this.repository.updateCustomerAddress({
      customerId,
      addressId,
      ...parsed.address,
      isDefault: payload.isDefault,
    });

    return { address, status: 200 };
  }

  async deleteCustomerAddress(customerId: string, addressId: string) {
    const deleted = await this.repository.deleteCustomerAddress(customerId, addressId);
    if (!deleted) {
      return { error: "Address not found.", status: 404 };
    }

    return { ok: true as const, status: 200 };
  }

  async setDefaultCustomerAddress(customerId: string, addressId: string) {
    const address = await this.repository.setDefaultCustomerAddress(customerId, addressId);
    if (!address) {
      return { error: "Address not found.", status: 404 };
    }

    return { address, status: 200 };
  }

  async getCustomerAddress(customerId: string, addressId: string): Promise<CustomerAddress | null> {
    return this.repository.getCustomerAddress(customerId, addressId);
  }
}
