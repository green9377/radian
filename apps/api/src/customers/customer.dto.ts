import { Relationship, DeliveryZone, OccasionType } from '@prisma/client';

export interface RecipientOccasionInput {
  type: OccasionType; // BIRTHDAY | ANNIVERSARY | CUSTOM
  date: string; // "MM-DD" recurring — the occasion list matches on this
  /** DEC-CUS-010 — only when the customer volunteered it ("10th anniversary") */
  year?: number | null;
  label?: string;
}

export interface RecipientInput {
  name: string;
  phone: string; // any country
  relationship: Relationship;
  zone: DeliveryZone; // DHAKA | BANGLADESH
  addressLine: string;
  note?: string;
  isFavorite?: boolean;
  occasions?: RecipientOccasionInput[];
}

export interface CreateCustomerDto {
  name: string;
  phone: string; // identity key — intl, unique
  email?: string;
  whatsappVerified?: boolean;
  country?: string;
  ownAddressLine?: string;
  note?: string;
  avatarBg?: string;
  /** DEC-CUS-009 — optional; empty means the initials stand in */
  imageUrl?: string | null;
  segmentIds?: string[];
  recipients?: RecipientInput[];
  actorName?: string;
  // NOTE: ordersCount / ltvPaisa / lastOrderAt / firstOrderAt এখানে নেই —
  // ওগুলো Sales-owned (DEC-CUS-004), Customer API কখনো সেট করে না।
}

export type UpdateCustomerDto = Partial<Omit<CreateCustomerDto, 'recipients'>>;

export type UpdateRecipientDto = Partial<RecipientInput> & { actorName?: string };

export interface ListCustomerQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  country?: string;
  segmentId?: string;
  status?: string; // ACTIVE | BLOCKED
  abroad?: string; // "true" = NRB only
}
