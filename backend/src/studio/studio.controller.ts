import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { httpError } from "../common/http/http-error";
import {
  clearStudioSessionCookie,
  createStudioSessionCookie,
  readStudioSession,
  requireStudioRequest,
  verifyStudioCredentials,
} from "../common/auth/studio-session";
import { MediaService } from "../media/media.service";

@Controller("studio")
export class StudioController {
  constructor(private readonly mediaService: MediaService) {}

  @Get("session")
  async getSession(@Req() req: Request) {
    const session = await readStudioSession(req);
    if (!session) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      studio: {
        email: session.email,
        role: session.role,
      },
    };
  }

  @Post("session")
  async signIn(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() payload: { email?: string; password?: string },
  ) {
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");

    if (!(await verifyStudioCredentials(email, password))) {
      httpError(401, { error: "The admin email or password is incorrect." });
    }

    res.setHeader("Set-Cookie", await createStudioSessionCookie(req, email));
    return { authenticated: true };
  }

  @Delete("session")
  @HttpCode(200)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Set-Cookie", clearStudioSessionCookie(req));
    return { authenticated: false };
  }

  @Post("uploads/product-image")
  @UseInterceptors(FileInterceptor("file"))
  async uploadProductImage(
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const unauthorized = await requireStudioRequest(req);
    if (unauthorized) {
      httpError(unauthorized.status, unauthorized.body as Record<string, unknown>);
    }

    const session = await readStudioSession(req);
    if (!session) {
      httpError(401, { error: "Unauthorized" });
    }

    if (!file) {
      httpError(400, { error: "Product image file is required." });
    }

    const result = await this.mediaService.uploadProductImage(
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
      session.email,
    );

    if (result.error || !result.asset) {
      httpError(result.status, { error: result.error || "Upload failed." });
    }

    return { asset: result.asset };
  }

  @Post("uploads/product-images")
  @UseInterceptors(FilesInterceptor("files", 8))
  async uploadProductImages(
    @Req() req: Request,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const unauthorized = await requireStudioRequest(req);
    if (unauthorized) {
      httpError(unauthorized.status, unauthorized.body as Record<string, unknown>);
    }

    const session = await readStudioSession(req);
    if (!session) {
      httpError(401, { error: "Unauthorized" });
    }

    if (!files?.length) {
      httpError(400, { error: "Select at least one product image." });
    }

    const assets = [];

    for (const file of files) {
      const result = await this.mediaService.uploadProductImage(
        {
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          buffer: file.buffer,
        },
        session.email,
      );

      if (result.error || !result.asset) {
        httpError(result.status, { error: result.error || "Upload failed." });
      }

      assets.push(result.asset);
    }

    return { assets };
  }
}
