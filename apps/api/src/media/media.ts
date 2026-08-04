import {
  BadRequestException,
  Controller,
  Injectable,
  Module,
  Post,
  Query,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Image upload → ImageKit. Added 30 Jul 2026.

  WHAT WAS HERE BEFORE: nothing. The admin's drag-and-drop boxes called
  `URL.createObjectURL(file)` and `sendUrl()` stripped any `blob:` value before
  the save request, so an image looked uploaded, survived until the page was
  refreshed, and then vanished. `CategoryEditor.tsx` said so in its own header —
  "start saving once the Media library lands". Nothing was broken; it was never
  built.

  WHY IMAGEKIT (owner's decision, 30 Jul): Cloudinary's free tier steps
  straight to $99/month with nothing between. This shop runs paid ads, so
  traffic moves in jumps and that step is a real risk. ImageKit's next step is
  $9 with per-GB overage. Bunny is cheaper again at scale and is the planned
  move if the bill grows — which is why nothing outside this file knows the
  provider's name. Swapping means rewriting `putObject()` and one env block.

  ⚠️ NO @Public() HERE, DELIBERATELY. `AuthGuard` is registered as `APP_GUARD`,
  so this route is closed unless someone adds `@Public()`. An open upload
  endpoint is a free file host for the whole internet, billed to the shop.
  Storefront uploads (customer review photos) will need their own route with
  its own rules — not this one.
  ═══════════════════════════════════════════════════════════════════════════
*/

/** Minimal shape of what FileInterceptor hands back. Declared here rather than
 *  pulling in @types/multer — one type is not worth a dependency and a rebuild. */
interface UploadedImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/*
  Folders are an allowlist, not free text.

  The folder arrives from the browser. Left open, a typo scatters images across
  invented folders nobody can find later, and a hostile caller can write
  anywhere in the account. Both are cheap to prevent and expensive to undo once
  thousands of files are in the wrong place.
*/
const FOLDERS = [
  'categories',
  'tags',
  'products',
  'banners',
  'icons',
  'collections',
  'reviews',
  'brand',
  'people', // staff photographs
  'items', // raw-material / inventory item photographs
  'suppliers', // supplier & vendor photographs
  'purchases', // purchase receipts photographed at the counter
  'delivery', // rider proof-of-delivery photographs
] as const;
type Folder = (typeof FOLDERS)[number];

const RASTER = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/*
  SVG — allowed for icons only, and I was wrong to refuse it outright earlier.

  The objection was that an SVG can carry script. Re-examined properly, it does
  not apply here, for two independent reasons:

   1. Scripts inside an SVG only run when the file is loaded AS A DOCUMENT —
      direct navigation, <object>, <embed>. Referenced through <img> or a CSS
      background, which is the only way this codebase renders it, they do not
      execute at all.
   2. These files are served from `ik.imagekit.io`, not from the shop's own
      domain, so even a document-load would run on someone else's origin.

  ⚠️ Point 2 stops being true the day images move to a custom domain
  (images.radianbd.com). If that happens, either sanitise on upload or keep
  serving icons through <img> and never <object>.

  Icons need SVG: they inherit the brand purple through `currentColor`, and a
  PNG icon arrives stuck in whatever colour it was drawn.

  Brand logos are on the same list (31 Jul 2026). A manufacturer hands over a
  vector logo far more often than a PNG, the admin screen has always told the
  owner "PNG or SVG on a transparent background looks best", and the logo is
  rendered through <img> / CSS background exactly as icons are — so the two
  reasons above cover it unchanged.
*/
const VECTOR_OK = new Set(['icons', 'brand']);
const ICON_EXTRA = ['image/svg+xml'];

const ALLOWED = RASTER;

export interface UploadResult {
  url: string;
  fileId: string;
  width: number;
  height: number;
}

@Injectable()
export class MediaService {
  private get creds() {
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    const endpoint = process.env.IMAGEKIT_URL_ENDPOINT;
    if (!privateKey || !endpoint) {
      // A missing key is a setup mistake, not a user mistake. Say which one.
      throw new ServiceUnavailableException(
        'Image uploads are not configured — IMAGEKIT_PRIVATE_KEY / IMAGEKIT_URL_ENDPOINT missing from .env',
      );
    }
    return { privateKey, endpoint };
  }

  async upload(file: UploadedImage | undefined, folder: string): Promise<UploadResult> {
    if (!file) throw new BadRequestException('No file received');

    const vector = VECTOR_OK.has(folder);
    const accepted = vector ? [...ALLOWED, ...ICON_EXTRA] : ALLOWED;
    if (!accepted.includes(file.mimetype)) {
      throw new BadRequestException(
        `${file.mimetype} is not an accepted image type. Use JPG, PNG or WebP${
          vector ? ' — or SVG here' : ''
        }.`,
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(
        `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`,
      );
    }
    if (!FOLDERS.includes(folder as Folder)) {
      throw new BadRequestException(`Unknown folder "${folder}"`);
    }

    return this.putObject(file, folder as Folder);
  }

  /**
   * The only function that knows which provider we use. Keep it that way —
   * moving to Bunny should be a rewrite of this body and nothing else.
   */
  private async putObject(file: UploadedImage, folder: Folder): Promise<UploadResult> {
    const { privateKey } = this.creds;

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }));
    form.append('fileName', safeName(file.originalname));
    form.append('folder', `/radian/${folder}`);
    // Never overwrite: two products called "rose.jpg" must not replace each other.
    form.append('useUniqueFileName', 'true');

    const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: {
        // ImageKit wants the private key as the username with an empty password.
        Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}`,
      },
      body: form,
    });

    const body = (await res.json().catch(() => ({}))) as {
      url?: string;
      fileId?: string;
      width?: number;
      height?: number;
      message?: string;
    };

    if (!res.ok || !body.url) {
      // Surface their message — "invalid key" and "quota exceeded" need
      // different actions, and a generic 500 tells the owner neither.
      throw new BadRequestException(
        `Upload failed (${res.status}): ${body.message ?? 'no response from the image service'}`,
      );
    }

    return {
      url: body.url,
      fileId: body.fileId ?? '',
      width: body.width ?? 0,
      height: body.height ?? 0,
    };
  }
}

/** Strip anything that is not a plain filename. The client's name is untrusted. */
function safeName(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
  return cleaned || 'image';
}

@Controller('media')
export class MediaController {
  constructor(private readonly svc: MediaService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      // Rejected here before the whole body is buffered, not after.
      limits: { fileSize: MAX_BYTES, files: 1 },
    }),
  )
  upload(@UploadedFile() file: UploadedImage, @Query('folder') folder = 'products') {
    return this.svc.upload(file, folder);
  }
}

@Module({
  providers: [MediaService],
  controllers: [MediaController],
})
export class MediaModule {}
