import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReviewSource, ReviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/auth.guard';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Reviews — admin side. Three sources, one table.

  ⚠️ WHAT THIS FILE WILL NOT DO, AND WHY.

  A review's `source` cannot be changed after it is created. It is the record
  of where the words came from: a customer wrote them, the shop typed them, or
  Google supplied them. Allowing an edit would let a shop-written review be
  relabelled as a customer's, which is precisely the line the owner was warned
  about on 30 Jul — fabricated testimonials breach Meta's and Google's ad
  policies and can cost an ad account.

  `verifiedPurchase` is likewise never accepted from a request. It is derived
  from the order history when a customer submission is built, and a badge the
  submitter can award themselves is worth nothing.

  Customer submissions arrive PENDING and are invisible until approved. That
  route went LIVE on 4 Aug 2026 (`PublicReviewsController` below) — and the
  moderation it depends on had existed from the first day, exactly so this
  moment would not need a retrofit.
  ═══════════════════════════════════════════════════════════════════════════
*/

export interface ReviewDto {
  authorName?: string;
  rating?: number;
  body?: string;
  context?: string | null;
  imageUrl?: string | null;
  productId?: string | null;
  status?: ReviewStatus;
  isFeatured?: boolean;
  sortOrder?: number;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  list(q: { status?: string; source?: string }) {
    const where: Prisma.ReviewWhereInput = {};
    if (q.status) where.status = q.status as ReviewStatus;
    if (q.source) where.source = q.source as ReviewSource;
    return this.prisma.db.review.findMany({
      where,
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        product: { select: { name: true, slug: true } },
        /*  DEC-WEB-006 — the account it came from, when the phone matched one.
            The screen shows the phone either way; the name only when known.  */
        customer: { select: { name: true, phone: true } },
      },
    });
  }

  /** how many are waiting — drives the badge on the sidebar and the screen */
  pendingCount() {
    return this.prisma.db.review.count({ where: { status: 'PENDING' } });
  }

  /**
   * Only ever creates SHOP reviews.
   *
   * The source is hard-coded rather than taken from the caller: this endpoint
   * is reachable only by an admin, and an admin typing a review is, by
   * definition, the shop speaking. A `source` field on the request would be a
   * way to label it as a customer's.
   */
  /**
   * গ্রাহকের form থেকে — সবসময় CUSTOMER + PENDING। slug → productId এখানে
   * resolve হয়, যাতে form-কে কখনো DB-id দিতে না হয়।
   */
  async submitFromCustomer(dto: {
    authorName?: string;
    rating?: number;
    body?: string;
    productSlug?: string;
    context?: string;
    /** DEC-WEB-006 — the photo they attached (already uploaded, moderated with the words) */
    imageUrl?: string;
    /** the shopper's session phone — a CLAIM; customerId is matched server-side */
    customerPhone?: string;
  }) {
    const body = dto.body?.trim() ?? '';
    if (body.length < 5) throw new BadRequestException('please write a few words');
    if (body.length > 1200) throw new BadRequestException('reviews are limited to 1200 characters');

    let productId: string | null = null;
    if (dto.productSlug?.trim()) {
      const prod = await this.prisma.db.product.findFirst({
        where: { slug: dto.productSlug.trim() },
        select: { id: true },
      });
      productId = prod?.id ?? null; // অজানা slug = shop-review, ব্যর্থতা নয়
    }

    /*  DEC-WEB-006 — কোন account থেকে এলো。 ফোনটা session-এর দাবি; server
        নিজে খাতার সাথে মিলিয়ে customerId বসায় — form-এর হাতে ওটা নেই。   */
    const phone = dto.customerPhone?.trim() || null;
    let customerId: string | null = null;
    if (phone) {
      const cust = await this.prisma.db.customer.findFirst({
        where: { phone }, select: { id: true },
      });
      customerId = cust?.id ?? null;
    }

    /*  ছবি শুধুই আমাদের নিজের ঘর থেকে — যেকোনো ঠিকানা DB-তে ঢুকিয়ে দিলে
        review-র ছবির নামে অন্যের সাইটের যা-খুশি ঝুলত。                    */
    const imageUrl =
      dto.imageUrl && /^https:\/\/ik\.imagekit\.io\//.test(dto.imageUrl) ? dto.imageUrl : null;

    await this.prisma.db.review.create({
      data: {
        source: 'CUSTOMER',
        status: 'PENDING', // মালিকের moderation-এর আগে পর্দায় নয় — কোনো ব্যতিক্রম নেই
        authorName: dto.authorName?.trim() || 'A customer',
        rating: clampRating(dto.rating),
        body,
        context: dto.context?.trim() || null,
        productId,
        imageUrl,
        customerPhone: phone,
        customerId,
      },
    });
    /*  পর্দায় দেখানোর মতো কিছুই ফেরত যায় না — PENDING review-র id-ও নয়।
        "ধন্যবাদ, ছাপার আগে আমরা একবার পড়ে নিই" — এটুকুই গ্রাহকের প্রাপ্য উত্তর।  */
    return { received: true };
  }

  create(dto: ReviewDto) {
    return this.prisma.db.review.create({
      data: {
        source: 'SHOP',
        // typed in by the owner, so it is published immediately — there is
        // nobody else to approve it
        status: 'PUBLISHED',
        authorName: dto.authorName?.trim() || 'A customer',
        rating: clampRating(dto.rating),
        body: dto.body?.trim() || '',
        context: dto.context?.trim() || null,
        imageUrl: dto.imageUrl || null,
        productId: dto.productId || null,
        isFeatured: dto.isFeatured ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, dto: ReviewDto) {
    const row = await this.prisma.db.review.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Review not found');

    /*  A Google review is not ours to rewrite. Its words belong to the person
        who left them and to Google's terms; editing one and leaving it labelled
        GOOGLE would be a forgery. Only the shop's own decisions about it —
        whether it is featured, and where it sits — can change here.  */
    if (row.source === 'GOOGLE' && (dto.body !== undefined || dto.authorName !== undefined || dto.rating !== undefined)) {
      throw new BadRequestException('A Google review cannot be edited — only hidden or featured');
    }

    return this.prisma.db.review.update({
      where: { id },
      data: {
        authorName: dto.authorName?.trim(),
        rating: dto.rating === undefined ? undefined : clampRating(dto.rating),
        body: dto.body?.trim(),
        context: dto.context === undefined ? undefined : dto.context?.trim() || null,
        imageUrl: dto.imageUrl === undefined ? undefined : dto.imageUrl || null,
        productId: dto.productId === undefined ? undefined : dto.productId || null,
        status: dto.status,
        isFeatured: dto.isFeatured,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async remove(id: string) {
    await this.prisma.db.review.update({ where: { id }, data: { deletedAt: new Date(), status: 'REJECTED' } });
    return { ok: true };
  }

  googleSettings() {
    return this.prisma.db.storefrontSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
  }

  /**
   * The Google summary, typed by hand until the Business Profile is verified
   * and connected — at which point these are overwritten by the real figures.
   *
   * The rating is clamped to 0–5 and rounded to one decimal. That does not make
   * an invented number true; it only stops a typo becoming "9.8 on Google",
   * which is the version a customer would notice.
   */
  saveGoogle(dto: { googleRating?: number | null; googleReviewCount?: number | null; googleProfileUrl?: string | null }) {
    const data = {
      googleRating:
        dto.googleRating === undefined
          ? undefined
          : dto.googleRating === null || Number.isNaN(dto.googleRating)
            ? null
            : Math.round(Math.min(5, Math.max(0, dto.googleRating)) * 10) / 10,
      googleReviewCount:
        dto.googleReviewCount === undefined
          ? undefined
          : dto.googleReviewCount === null
            ? null
            : Math.max(0, Math.round(dto.googleReviewCount)),
      googleProfileUrl: dto.googleProfileUrl === undefined ? undefined : dto.googleProfileUrl?.trim() || null,
    };
    return this.prisma.db.storefrontSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...data },
      update: data,
    });
  }
}

/** 1–5, and a missing value is 5 rather than 0 — a review with no stars at all
 *  renders as a one-star, which is the opposite of what a blank field means. */
function clampRating(v: number | undefined): number {
  if (!v || Number.isNaN(v)) return 5;
  return Math.min(5, Math.max(1, Math.round(v)));
}

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Get()
  list(@Query('status') status?: string, @Query('source') source?: string) {
    return this.svc.list({ status, source });
  }
  @Get('pending-count')
  pending() {
    return this.svc.pendingCount();
  }
  @Get('google')
  google() {
    return this.svc.googleSettings();
  }
  @Patch('google')
  saveGoogle(@Body() dto: { googleRating?: number | null; googleReviewCount?: number | null; googleProfileUrl?: string | null }) {
    return this.svc.saveGoogle(dto);
  }
  @Post()
  create(@Body() dto: ReviewDto) {
    return this.svc.create(dto);
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ReviewDto) {
    return this.svc.update(id, dto);
  }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}

/*
  ═══ গ্রাহকের নিজের হাতে লেখা review — ৪ আগস্ট ২০২৬ ═══

  Schema-র `ReviewSource.CUSTOMER` জন্ম থেকেই লিখে রেখেছিল: *"written by a
  shopper on the site — always starts PENDING"*। দরজাটাই ছিল না — review
  ঢোকার একমাত্র পথ ছিল admin-এর হাত। এই controller সেই দরজা।

  ⚠️ PENDING বাধ্যতামূলক, form যা-ই দাবি করুক। স্তুতি হোক বা গালি — মালিকের
  moderation পেরিয়ে তবেই পর্দায় (Storefront → Reviews, pending গোনা সহ)।
  `verifiedPurchase`-ও এখানে বসানো হয় না — ওই badge server-ই দেয়, form নয়।
*/
@Controller('shop')
export class PublicReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Public()
  @Post('reviews')
  async submit(
    @Body()
    dto: {
      authorName?: string;
      rating?: number;
      body?: string;
      productSlug?: string;
      context?: string;
    },
  ) {
    return this.svc.submitFromCustomer(dto);
  }
}

@Module({
  providers: [ReviewsService],
  controllers: [ReviewsController, PublicReviewsController],
})
export class ReviewsModule {}
