import {
  BadRequestException,
  CanActivate,
  Controller,
  Delete,
  HttpCode,
  Injectable,
  Post,
  Query,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { FileInterceptor } from '@nestjs/platform-express';
import { StoredUpload, uploadToDisk } from '@nestjs/storage';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import { slugify } from '../common/slug.js';
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  UploadsService,
} from './uploads.service.js';

/** Where in the bucket a file may go, e.g. "product/rings". Same layout as the existing catalog images. */
const FOLDER = /^[a-z0-9-]+(\/[a-z0-9-]+){0,2}$/;
const ROOT = 'diadiamonds';

const folderOf = (req: { query?: { folder?: unknown } }): string => {
  const folder =
    typeof req.query?.folder === 'string'
      ? req.query.folder.toLowerCase()
      : 'misc';
  return FOLDER.test(folder) ? folder : 'misc';
};

/** Answers 503 before any bytes are read when R2 is not set up. */
@Injectable()
class StorageReadyGuard implements CanActivate {
  constructor(private readonly uploads: UploadsService) {}
  canActivate(): boolean {
    this.uploads.assertConfigured();
    return true;
  }
}

@ApiTags('uploads')
@ApiBearerAuth()
@Can(PermissionPolicy, 'media')
@UseGuards(StorageReadyGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * Upload one image (field "file", multipart). Optional ?folder=product/rings.
   * The type is detected from the file's bytes, not trusted from the client; SVG is refused.
   */
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: uploadToDisk({
        disk: 'files',
        contentTypes: IMAGE_TYPES,
        // Names never repeat, so browsers and Cloudflare may cache them forever.
        cacheControl: 'public, max-age=31536000, immutable',
        key: (file, req) => {
          const base =
            slugify(file.originalname.replace(/\.[^.]+$/, '')) || 'image';
          return `${ROOT}/${folderOf(req)}/${base}-${Date.now()}${randomBytes(2).toString('hex')}${file.extension}`;
        },
      }),
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    }),
  )
  upload(@UploadedFile() file: StoredUpload | undefined) {
    if (!file)
      throw new BadRequestException('Send the image as multipart field "file"');
    return this.uploads.describe(file);
  }

  /**
   * Upload one video (mp4 or webm, field "file", multipart), for banners. The storage package cannot
   * recognise video, so the type is read from the file's own header here instead of trusting the client.
   */
  @Post('video')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_VIDEO_BYTES, files: 1 } }),
  )
  async uploadVideo(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Query('folder') folderParam?: string,
  ) {
    if (!file)
      throw new BadRequestException('Send the video as multipart field "file"');
    const head = file.buffer.subarray(0, 12);
    const isMp4 = head.subarray(4, 8).toString('ascii') === 'ftyp';
    const isWebm = head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (!isMp4 && !isWebm)
      throw new UnsupportedMediaTypeException('File type not allowed. Allowed types: video/mp4, video/webm');
    const folder = folderOf({ query: { folder: folderParam } });
    const base = slugify(file.originalname.replace(/\.[^.]+$/, '')) || 'video';
    const key = `${ROOT}/${folder}/${base}-${Date.now()}${randomBytes(2).toString('hex')}${isMp4 ? '.mp4' : '.webm'}`;
    return this.uploads.putVideo(key, file.buffer, isMp4 ? 'video/mp4' : 'video/webm');
  }

  @Delete()
  @HttpCode(204)
  remove(@Query('key') key: string) {
    const parsed = z.string().startsWith(`${ROOT}/`).max(300).safeParse(key);
    if (!parsed.success || parsed.data.includes('..'))
      throw new BadRequestException('Invalid key');
    return this.uploads.remove(parsed.data);
  }
}
