import { Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { MediaService } from "./media.service";

@Controller("media")
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get("*path")
  async readMedia(@Req() req: Request, @Res() res: Response) {
    const rawPath = req.params.path;
    const key = (Array.isArray(rawPath) ? rawPath.join("/") : rawPath || req.path).replace(
      /^\/(?:api\/)?media\/?/,
      "",
    );
    const object = await this.mediaService.readMediaObject(key);

    if (!object) {
      res.status(404).json({ error: "Media not found" });
      return;
    }

    res.setHeader("Content-Type", object.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(object.buffer);
  }
}
