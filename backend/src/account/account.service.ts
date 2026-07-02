import { Inject, Injectable } from "@nestjs/common";
import type { CustomerProfile } from "../domain";
import { customerProfile } from "../common/auth/customer-session";
import { hashPassword, verifyPassword } from "../common/auth/password";
import { cleanCheckoutText } from "../common/validation/input";
import { COMMERCE_REPOSITORY, type CommerceRepository } from "../commerce/commerce.repository";

type RegisterPayload = {
  email?: string;
  name?: string;
  password?: string;
  phone?: string;
};

type SignInPayload = {
  email?: string;
  password?: string;
};

function cleanEmail(value: unknown) {
  return cleanCheckoutText(value, 160).toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string) {
  return password.length >= 8;
}

@Injectable()
export class AccountService {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly repository: CommerceRepository,
  ) {}

  async registerCustomer(payload: RegisterPayload) {
    const email = cleanEmail(payload.email);
    const name = cleanCheckoutText(payload.name, 120);
    const phone = cleanCheckoutText(payload.phone, 30);
    const password = String(payload.password || "");

    if (!name) {
      return { error: "Full name is required.", status: 400 };
    }

    if (!isValidEmail(email)) {
      return { error: "Enter a valid email address.", status: 400 };
    }

    if (!isValidPassword(password)) {
      return { error: "Password must be at least 8 characters.", status: 400 };
    }

    const existing = await this.repository.getCustomerByEmail(email);
    if (existing) {
      return { error: "An account already exists for this email.", status: 409 };
    }

    const customer = await this.repository.createCustomer({
      email,
      name,
      phone: phone || undefined,
      passwordHash: await hashPassword(password),
    });

    return { customer: customerProfile(customer), status: 201 };
  }

  async authenticateCustomer(payload: SignInPayload) {
    const email = cleanEmail(payload.email);
    const password = String(payload.password || "");

    if (!isValidEmail(email) || !password) {
      return { error: "Email and password are required.", status: 400 };
    }

    const customer = await this.repository.getCustomerByEmail(email);
    if (!customer || !(await verifyPassword(password, customer.passwordHash))) {
      return { error: "Email or password is incorrect.", status: 401 };
    }

    return { customer: customerProfile(customer), status: 200 };
  }

  async getCustomerProfile(customerId: string): Promise<CustomerProfile | null> {
    const customer = await this.repository.getCustomerById(customerId);
    return customer ? customerProfile(customer) : null;
  }

  async getCustomerOrders(customerId: string, email: string) {
    return this.repository.listOrdersForCustomer(customerId, email);
  }
}
