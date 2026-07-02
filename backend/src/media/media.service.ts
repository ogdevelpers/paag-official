import { Inject, Injectable } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import { COMMERCE_REPOSITORY, type CommerceRepository } from "../commerce/commerce.repository";

const maxImageSize = 8 * 1024 * 1024;

function envValue(name: string) {
  return process.env[name] || "";
}

function supabaseStorage() {
  const url = envValue("SUPABASE_URL");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = envValue("SUPABASE_STORAGE_BUCKET");

  if (!url || !key || !bucket) return null;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { client, bucket };
}

function safeFilename(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return cleaned || "product-image";
}

function extensionForContentType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

@Injectable()
export class MediaService {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly repository: CommerceRepository,
  ) {}

  async uploadProductImage(
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    uploadedBy: string,
  ) {
    const storage = supabaseStorage();
    if (!storage) {
      return { error: "Supabase media storage is not configured.", status: 503 };
    }

    const contentType = file.mimetype || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return { error: "Upload an image file.", status: 400 };
    }

    if (file.size > maxImageSize) {
      return { error: "Image must be 8 MB or smaller.", status: 400 };
    }

    const filename = safeFilename(
      file.originalname || `product.${extensionForContentType(contentType)}`,
    );
    const key = `products/${crypto.randomUUID()}-${filename}`;
    const url = `/api/media/${key}`;

    const { error } = await storage.client.storage.from(storage.bucket).upload(key, file.buffer, {
      contentType,
      upsert: false,
    });

    if (error) {
      return { error: "Unable to upload product image.", status: 502 };
    }

    const asset = await this.repository.createMediaAsset({
      key,
      url,
      filename,
      contentType,
      size: file.size,
      uploadedBy,
    });

    return { asset, status: 201 };
  }

  async readMediaObject(key: string) {
    const storage = supabaseStorage();
    if (!storage) return null;

    const normalizedKey = key.replace(/^\/+/, "");
    if (!normalizedKey || normalizedKey.includes("..")) return null;

    const { data, error } = await storage.client.storage
      .from(storage.bucket)
      .download(normalizedKey);

    if (error || !data) return null;

    const buffer = Buffer.from(await data.arrayBuffer());
    return {
      buffer,
      contentType: data.type || "application/octet-stream",
    };
  }
}
