import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paidPaisa } from '../common/discount-window';

/*
  AI-র tool belt — শুধুই পড়া (DEC-INB-005 / INB-RULE-004)।

  এখানে একটাও write নেই, আর থাকবেও না — নতুন tool মানে মালিকের অনুমোদন +
  DEC entry। দাম সবসময় `paidPaisa()` দিয়ে — grid/PDP/checkout যে অঙ্কে চলে,
  AI-ও সেই একই অঙ্কে (এক কপি নিয়মের ৩ আগস্টের শিক্ষা)।

  ফলাফলগুলো ইচ্ছা করে ছোট আর সমতল — model-এর context-এ যায়, প্রতিটা বাড়তি
  field মানে প্রতি উত্তরে টাকা।
*/

const LIVE = { deletedAt: null, isPublished: true } as const;

export interface ToolProduct {
  slug: string;
  name: string;
  pricePaisa: number;
  imageUrl: string | null;
  zone: string;
  isBestSeller: boolean;
}

@Injectable()
export class InboxAiTools {
  constructor(private readonly prisma: PrismaService) {}

  /** DEC-INB-007 — "budget ৳2000, bouquet দেখান" এর ইঞ্জিন */
  async searchProducts(args: {
    query?: string;
    budgetMinPaisa?: number;
    budgetMaxPaisa?: number;
    categorySlug?: string;
    occasionSlug?: string;
    limit?: number;
  }): Promise<ToolProduct[]> {
    const take = Math.min(Math.max(args.limit ?? 6, 1), 10);

    const where: Prisma.ProductWhereInput = { ...LIVE };
    if (args.query?.trim()) {
      where.OR = [
        { name: { contains: args.query.trim(), mode: 'insensitive' } },
        { category: { is: { name: { contains: args.query.trim(), mode: 'insensitive' } } } },
      ];
    }
    if (args.categorySlug) {
      where.category = {
        is: { OR: [{ slug: args.categorySlug }, { parent: { is: { slug: args.categorySlug } } }] },
      };
    }
    if (args.occasionSlug) {
      where.tags = { some: { slug: args.occasionSlug, deletedAt: null } };
    }

    // ছাড়ের পরের দামে budget মিলাতে হবে, তাই দাম আগে গুনে পরে ছাঁকা
    const rows = await this.prisma.db.product.findMany({
      where,
      orderBy: [{ isBestSeller: 'desc' }, { salesCount: 'desc' }],
      take: 60,
      select: {
        slug: true,
        name: true,
        sellingPricePaisa: true,
        discountType: true,
        discountValue: true,
        discountStartsAt: true,
        discountEndsAt: true,
        zone: true,
        isBestSeller: true,
        images: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { url: true },
        },
      },
    });

    return rows
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        pricePaisa: paidPaisa(r),
        imageUrl: r.images[0]?.url ?? null,
        zone: r.zone,
        isBestSeller: r.isBestSeller,
      }))
      .filter(
        (p) =>
          (args.budgetMinPaisa === undefined || p.pricePaisa >= args.budgetMinPaisa) &&
          (args.budgetMaxPaisa === undefined || p.pricePaisa <= args.budgetMaxPaisa),
      )
      .slice(0, take);
  }

  /** "আমার order কোথায়?" — নম্বর বা ফোন, দুটোতেই খোঁজে */
  async orderStatus(args: { orderNo?: string; phone?: string }) {
    const where: Prisma.OrderWhereInput = { deletedAt: null };
    if (args.orderNo?.trim()) {
      where.orderNo = args.orderNo.trim().toUpperCase();
    } else if (args.phone?.trim()) {
      const digits = args.phone.replace(/[\s\-()]/g, '');
      const normalized = /^01\d{9}$/.test(digits) ? `+880${digits.slice(1)}` : digits;
      where.OR = [
        { senderPhone: { contains: digits.slice(-10) } },
        { customer: { is: { phone: normalized } } },
      ];
    } else {
      return { found: false, note: 'Need an order number or a phone number' };
    }

    const orders = await this.prisma.db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        orderNo: true,
        salesStatus: true,
        deliveryStatus: true,
        methodLabel: true,
        date: true,
        slotLabel: true,
        totalPaisa: true,
        paymentStatus: true,
        duePaisa: true,
        createdAt: true,
      },
    });
    if (orders.length === 0) return { found: false, note: 'No order matches' };
    return { found: true, orders };
  }

  /** কোথায় কী delivery, কত টাকায় — checkout-এর একই টেবিল থেকে */
  async deliveryInfo() {
    const methods = await this.prisma.db.deliveryMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        label: true,
        zone: true,
        feePaisa: true,
        etaLabel: true,
        cutoffTime: true,
      },
    });
    return { methods };
  }

  /** দোকানের সময়/নীতি — যা প্রকাশ্যে ছাপা আছে, তার বাইরে এক শব্দও না */
  async shopInfo() {
    const pages = await this.prisma.db.contentPage.findMany({
      where: { deletedAt: null, isPublished: true },
      select: { slug: true, title: true, excerpt: true },
      take: 20,
    });
    const faqs = await this.prisma.db.faqEntry.findMany({
      where: { deletedAt: null, isPublished: true },
      orderBy: { sortOrder: 'asc' },
      take: 20,
      select: { question: true, answerHtml: true },
    });
    return {
      pages,
      faqs: faqs.map((f) => ({
        question: f.question,
        // model-কে HTML চিবাতে দিলে token পোড়ে — সমতল লেখা যথেষ্ট
        answer: (f.answerHtml ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
      })),
    };
  }
}
