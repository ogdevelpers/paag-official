import { Inject, Injectable } from "@nestjs/common";
import { customerProfile } from "../common/auth/customer-session";
import { hashPassword, verifyPassword } from "../common/auth/password";
import { COMMERCE_REPOSITORY, type CommerceRepository } from "../commerce/commerce.repository";

type VerificationChannel = "email" | "sms";

const codeTtlMs = 10 * 60 * 1000;
const maxAttempts = 5;

function envValue(name: string) {
  return process.env[name] || "";
}

function generateCode() {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return String(values[0] % 1000000).padStart(6, "0");
}

function cleanChannel(value: unknown): VerificationChannel | null {
  return value === "email" || value === "sms" ? value : null;
}

function cleanCode(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

function maskDestination(channel: VerificationChannel, destination: string) {
  if (channel === "sms") {
    return destination.length > 4 ? `•••• ${destination.slice(-4)}` : destination;
  }

  const [name, domain] = destination.split("@");
  if (!domain) return destination;
  return `${name.slice(0, 2)}***@${domain}`;
}

async function deliverEmailCode(destination: string, code: string) {
  const apiKey = envValue("RESEND_API_KEY");
  const from = envValue("RESEND_FROM_EMAIL");

  if (!apiKey || !from) {
    return { devOnly: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: destination,
      subject: "Your PAAG verification code",
      text: `Your PAAG verification code is ${code}. It expires in 10 minutes.`,
    }),
  });

  if (!response.ok) {
    return { error: "Unable to send verification email." };
  }

  return { devOnly: false };
}

async function deliverSmsCode(destination: string, code: string) {
  const accountSid = envValue("TWILIO_ACCOUNT_SID");
  const authToken = envValue("TWILIO_AUTH_TOKEN");
  const from = envValue("TWILIO_FROM_NUMBER");

  if (!accountSid || !authToken || !from) {
    return { devOnly: true };
  }

  const body = new URLSearchParams({
    To: destination,
    From: from,
    Body: `Your PAAG verification code is ${code}. It expires in 10 minutes.`,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!response.ok) {
    return { error: "Unable to send verification SMS." };
  }

  return { devOnly: false };
}

@Injectable()
export class VerificationService {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly repository: CommerceRepository,
  ) {}

  async requestCustomerVerification(customerId: string, channelValue: unknown) {
    const channel = cleanChannel(channelValue);
    if (!channel) {
      return { error: "Choose email or SMS verification.", status: 400 };
    }

    const customer = await this.repository.getCustomerById(customerId);
    if (!customer) {
      return { error: "Customer not found.", status: 404 };
    }

    const destination = channel === "email" ? customer.email : customer.phone;
    if (!destination) {
      return { error: "Add a phone number before SMS verification.", status: 400 };
    }

    const code = generateCode();
    const delivery =
      channel === "email"
        ? await deliverEmailCode(destination, code)
        : await deliverSmsCode(destination, code);

    if (delivery.error) {
      return { error: delivery.error, status: 502 };
    }

    await this.repository.createVerificationCode({
      customerId,
      channel,
      destination,
      codeHash: await hashPassword(code),
      expiresAt: new Date(Date.now() + codeTtlMs).toISOString(),
    });

    return {
      status: 200,
      destination: maskDestination(channel, destination),
      devCode: delivery.devOnly ? code : undefined,
    };
  }

  async confirmCustomerVerification(
    customerId: string,
    channelValue: unknown,
    codeValue: unknown,
  ) {
    const channel = cleanChannel(channelValue);
    const code = cleanCode(codeValue);

    if (!channel || code.length !== 6) {
      return { error: "Enter the 6-digit verification code.", status: 400 };
    }

    const storedCode = await this.repository.getLatestVerificationCode({ customerId, channel });
    if (!storedCode || storedCode.consumedAt) {
      return { error: "Request a new verification code.", status: 400 };
    }

    if (storedCode.attempts >= maxAttempts) {
      return { error: "Too many attempts. Request a new code.", status: 429 };
    }

    if (new Date(storedCode.expiresAt).getTime() < Date.now()) {
      return { error: "Verification code expired.", status: 400 };
    }

    const valid = await verifyPassword(code, storedCode.codeHash);
    if (!valid) {
      await this.repository.incrementVerificationCodeAttempts(storedCode.id);
      return { error: "Verification code is incorrect.", status: 400 };
    }

    const verifiedAt = new Date().toISOString();
    await this.repository.markVerificationCodeConsumed(storedCode.id);
    const customer = await this.repository.updateCustomer({
      id: customerId,
      emailVerifiedAt: channel === "email" ? verifiedAt : undefined,
      phoneVerifiedAt: channel === "sms" ? verifiedAt : undefined,
    });

    return {
      customer: customer ? customerProfile(customer) : null,
      status: 200,
    };
  }
}
