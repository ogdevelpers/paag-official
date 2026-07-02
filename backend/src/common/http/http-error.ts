import { HttpException } from "@nestjs/common";

export function httpError(status: number, body: Record<string, unknown>): never {
  throw new HttpException(body, status);
}
