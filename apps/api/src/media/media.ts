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
import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { Public } from '../auth/auth.guard';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Image upload. Added 30 Jul 2026 (ImageKit); moved to VPS disk 29 Aug 2026.

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
  'perso', // DEC-PRD-061 — the customer's own photo, printed onto the product
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
   2. These files are served from the media host (PUBLIC_MEDIA_URL), which is
      a separate origin from the shop and the admin, so even a document-load
      would run outside both apps. Caddy also sends X-Content-Type-Options:
      nosniff on everything it serves from there.

  ⚠️ Point 2 stops being true if media ever moves onto the SHOP's own origin.
  If that happens, either sanitise on upload or keep serving icons through
  <img> and never <object>.

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
  /*
    29 Aug 2026 (owner): images live on OUR server now, not ImageKit. The VPS
    stores the file on disk (MEDIA_DIR, a bind mount shared with Caddy) and
    Caddy serves it from PUBLIC_MEDIA_URL with long immutable cache headers.
    The header comment's promise held: only putObject changed.
    The SVG note above still holds too — the media host is a separate origin
    from the shop, and Caddy adds nosniff.
  */
  private get storage() {
    const dir = process.env.MEDIA_DIR;
    const base = (process.env.PUBLIC_MEDIA_URL ?? '').replace(/\/+$/, '');
    if (!dir || !base) {
      // A missing value is a setup mistake, not a user mistake. Say which one.
      throw new ServiceUnavailableException(
        'Image uploads are not configured — MEDIA_DIR / PUBLIC_MEDIA_URL missing from .env',
      );
    }
    return { dir, base };
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
   * The only function that knows where files live. Keep it that way —
   * moving providers again should be a rewrite of this body and nothing else.
   */
  private async putObject(file: UploadedImage, folder: Folder): Promise<UploadResult> {
    const { dir, base } = this.storage;

    // Never overwrite: two products called "rose.jpg" must not replace each
    // other. The unique prefix also makes every URL immutable, which is what
    // lets Caddy serve them with a one-year cache header.
    const name = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}-${safeName(file.originalname)}`;
    const rel = `radian/${folder}/${name}`;

    try {
      await mkdir(join(dir, 'radian', folder), { recursive: true });
      await writeFile(join(dir, rel), file.buffer);
    } catch (e) {
      throw new BadRequestException(
        `Upload failed: could not write the file to media storage (${(e as Error).message})`,
      );
    }

    // width/height were ImageKit metadata; nothing in the admin reads them.
    return { url: `${base}/${rel}`, fileId: rel, width: 0, height: 0 };
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

  /**
   * DEC-WEB-006 (11 Aug 2026) — a customer attaching a photo to their review.
   *
   * The ONLY public upload in the system, and deliberately narrower than the
   * admin one: the folder is hard-coded (no query parameter to wander with),
   * the size cap is 3 MB instead of 10, and JPG/PNG/WebP only — never SVG,
   * which can carry scripts. What the photo shows is the owner's problem, not
   * this endpoint's: a review is born PENDING and nothing shows on the site
   * until he approves it, photo included.
   */
  @Public()
  @Post('upload/review-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    }),
  )
  uploadReviewPhoto(@UploadedFile() file: UploadedImage) {
    return this.svc.upload(file, 'reviews');
  }

  /**
   * DEC-PRD-061 (30 Aug 2026) — the photograph a customer attaches to a
   * personalised item.
   *
   * ⚠️ Until today this did not exist, and the product page pretended it did.
   * "Tap to upload" put the FILE NAME into the browser's cart and nothing
   * else: no file left the device, the checkout payload had no field for one,
   * and `OrderLine` had no column. A customer chose a photo, saw it accepted,
   * and the shop received a bouquet order with a filename nobody could open.
   * Worse, a product with "photo required" switched on took orders anyway —
   * `persoImageRequired` was read at checkout and never tested, because there
   * was nothing to test.
   *
   * ⚠️ THE SIZE CAP IS 10 MB, NOT THE REVIEW ROUTE'S 3. The owner's ruling,
   * 30 Aug: this photo is PRINTED ON THE PRODUCT. A 3 MB cap would quietly
   * decide that a phone photograph good enough for a frame is refused, and the
   * customer would have no idea why their picture was the wrong one.
   *
   * Otherwise it is the review route's shape, for the review route's reasons:
   * the folder is hard-coded so nothing can wander, one file at a time, and
   * JPG/PNG/WebP/AVIF only — never SVG, whatever it claims to be.
   */
  @Public()
  @Post('upload/perso-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  uploadPersoPhoto(@UploadedFile() file: UploadedImage) {
    return this.svc.upload(file, 'perso');
  }
}

@Module({
  providers: [MediaService],
  controllers: [MediaController],
})
export class MediaModule {}
