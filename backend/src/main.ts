import { existsSync } from "fs";
import { resolve } from "path";
import { config as loadEnv } from "dotenv";

for (const envPath of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath });
    break;
  }
}

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { json } from "express";
import { AppModule } from "./app.module";

function allowedOrigins() {
  const configured = process.env.FRONTEND_URL?.split(",").map((value) => value.trim()).filter(Boolean);
  if (configured?.length) return configured;
  return ["http://localhost:3000"];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  app.use(cookieParser());
  app.use(
    "/api/payments/webhook/cashfree",
    json({
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(
    "/api/payments/webhook/razorpay",
    json({
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(json());

  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
  });

  const port = Number(process.env.PORT || process.env.API_PORT || 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
