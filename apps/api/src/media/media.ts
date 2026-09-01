import {
  BadRequestException,
  Controller,
  Injectable,
  Module,
  Post,
  Query,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { Public } from '../auth/auth.guard';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { PERSO_PHOTO_LIMIT, REVIEW_PHOTO_LIMIT } from '../common/rate-limits';

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

  S-04 / S-01 (31 Aug 2026) added a third reason, and it is the sturdiest:
  `sniffImage` below now requires the file's FIRST REAL TAG to be <svg>, so a
  document that is really HTML can no longer arrive here wearing an SVG label;
  and Caddy serves the whole media host under
  `default-src 'none'; sandbox`, which makes even a direct navigation inert.

  Icons need SVG: they inherit the brand purple through `currentColor`, and a
  PNG icon arrives stuck in whatever colour it was drawn.

  Brand logos are on the same list (31 Jul 2026). A manufacturer hands over a
  vector logo far more often than a PNG, the admin screen has always told the
  owner "PNG or SVG on a transparent background looks best", and the logo is
  rendered through <img> / CSS background exactly as icons are — so the two
  reasons above cover it unchanged.
*/
const VECTOR_OK = new Set(['icons', 'brand']);

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

    if (file.size > MAX_BYTES) {
      throw new BadRequestException(
        `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`,
      );
    }
    if (!FOLDERS.includes(folder as Folder)) {
      throw new BadRequestException(`Unknown folder "${folder}"`);
    }

    /*
      ═══════════════════════════════════════════════════════════════════════
      S-04 (31 Aug 2026) — THE FILE'S OWN BYTES DECIDE WHAT IT IS.

      What was here before compared `file.mimetype`, and multer copies that
      straight from the request's Content-Type header. The uploader writes it.
      So `evil.html` announced as `image/png` passed the check, `safeName` kept
      the .html on the end, and Caddy then served it as text/html from the
      media host — a page on a radianbd.com subdomain, written by a stranger.

      Two changes close it, and each would be enough on its own:

        1. the type comes from the first bytes, which the uploader cannot lie
           about without actually sending that kind of file;
        2. the stored extension is DERIVED from that type, never carried over
           from the name they typed. Whatever they call it, a JPEG lands as
           .jpg.

      The declared mimetype is now ignored entirely. It never told us anything
      true, and keeping it as a second condition would only mean refusing real
      images whose browser guessed the header badly.
      ═══════════════════════════════════════════════════════════════════════
    */
    const kind = sniffImage(file.buffer);
    const vector = VECTOR_OK.has(folder);

    if (!kind) {
      throw new BadRequestException(
        `That file is not an image we can use. Please upload a JPG, PNG or WebP${
          vector ? ' — or an SVG here' : ''
        }.`,
      );
    }
    if (kind === 'image/svg+xml' && !vector) {
      /*  Unchanged rule, now actually enforced: SVG lives in `icons` and
          `brand` only. Before this, the rule was enforced against a header
          anyone could set.  */
      throw new BadRequestException(
        'SVG can only be used for icons and brand logos. Please upload a JPG, PNG or WebP here.',
      );
    }

    return this.putObject(file, folder as Folder, kind);
  }

  /**
   * The only function that knows where files live. Keep it that way —
   * moving providers again should be a rewrite of this body and nothing else.
   */
  private async putObject(
    file: UploadedImage,
    folder: Folder,
    kind: ImageKind,
  ): Promise<UploadResult> {
    const { dir, base } = this.storage;

    // Never overwrite: two products called "rose.jpg" must not replace each
    // other. The unique prefix also makes every URL immutable, which is what
    // lets Caddy serve them with a one-year cache header.
    //
    // S-04 — the readable half still comes from what the customer called it,
    // because "rose-bouquet" in a filename is what makes a file findable on
    // disk later. Only the EXTENSION is ours, and the extension is the half
    // that decides how Caddy serves it.
    const name =
      `${Date.now().toString(36)}${randomBytes(3).toString('hex')}` +
      `-${safeStem(file.originalname)}.${EXT_FOR[kind]}`;
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

/**
 * Strip anything that is not a plain filename, AND drop whatever extension the
 * client put on it. The name is untrusted twice over: for the path separators
 * it may contain, and for the `.html` it may end with (S-04). What comes back
 * is a stem; `putObject` adds the extension the bytes earned.
 */
function safeStem(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
  /*  Everything from the first dot onwards goes. Not just the last one:
      `x.html.png` must not keep `.html` in the middle either, because some
      servers still route on a compound extension.  */
  const stem = cleaned.replace(/\..*$/, '');
  return stem || 'image';
}

/* ─────────────────── S-04: what the bytes say ─────────────────── */

export type ImageKind =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/svg+xml';

/** the ONLY extensions this system ever writes */
const EXT_FOR: Record<ImageKind, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

/**
 * Identify an image from its opening bytes. Null means "not one of ours",
 * which is a refusal — never a guess.
 */
export function sniffImage(buf: Buffer | undefined): ImageKind | null {
  if (!buf || buf.length < 12) return null;

  // FF D8 FF — every JPEG, whatever else follows.
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';

  // 89 'P' 'N' 'G' CR LF SUB LF — the full eight-byte signature, because the
  // first four alone also match a few unrelated formats.
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return 'image/png';

  // RIFF????WEBP — a RIFF container whose form type is WEBP. Checking only
  // "RIFF" would also accept a .wav.
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';

  /*  ISO-BMFF: a box length, then 'ftyp', then the brand. AVIF and HEIF share
      the container, so the brand is what separates them, and it can sit either
      in the major-brand slot or later in the compatible-brands list.  */
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brands = buf.toString('ascii', 8, Math.min(buf.length, 64));
    if (/avif|avis/.test(brands)) return 'image/avif';
    return null;
  }

  /*  SVG is text, so there is no signature to match — which is exactly why it
      is the one that needs checking hardest. The test is that the first real
      tag IS <svg>: an XML declaration, comments and a doctype may come first,
      and nothing else may.

      This is what stops `<html><script>…` being accepted as "an SVG" on the
      strength of an <svg> tag hidden further down the file.  */
  const head = buf.toString('utf8', 0, Math.min(buf.length, 2048));
  let rest = head.replace(/^﻿/, '').trimStart();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const before = rest;
    rest = rest
      .replace(/^<\?xml[^>]*\?>/i, '')
      .replace(/^<!--[\s\S]*?-->/, '')
      .replace(/^<!DOCTYPE[^>]*>/i, '')
      .trimStart();
    if (rest === before) break;
  }
  if (/^<svg[\s>]/i.test(rest)) return 'image/svg+xml';

  return null;
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
  /*  S-02 — public, and it writes to the VPS disk. Without a limit, a stranger
      with no account fills a 200 GB disk 3 MB at a time and it costs them
      nothing.  */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(REVIEW_PHOTO_LIMIT)
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
  /*  S-02 — the same disk, at 10 MB a time. The allowance is higher than the
      review route's because this upload is part of BUYING: three personalised
      gifts mean three photos, and a retry over a phone connection is normal.
      Refusing that is refusing an order.  */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(PERSO_PHOTO_LIMIT)
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
