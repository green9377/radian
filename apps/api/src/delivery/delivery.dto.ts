/* Delivery Management DTOs — RADIAN_DELIVERY_MODULE_ARCHITECTURE.md (DEC-DLV-001…006) */

export interface MethodWriteDto {
  label: string;
  zone: 'DHAKA' | 'BANGLADESH';
  kind?: 'RIDER' | 'COURIER';
  feePaisa?: number;
  cutoffTime?: string | null;
  etaLabel?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  /**
   * Does this speed get a card in the homepage's "Need It Today" band?
   *
   * ⚠️ Advertising, not availability — `isActive` is what decides whether a
   * customer may pick it at checkout. Kept apart on purpose (3 Aug 2026).
   */
  isFeatured?: boolean;
  /**
   * DEC-DLV-007 — which area this price belongs to. `null` (or absent on
   * create) = one price for the whole zone, which is what most shops want and
   * what keeps the customer from being asked where they live.
   */
  areaId?: string | null;
  /** DEC-DLV-008 — which NAME this price belongs to. */
  typeId?: string | null;
  actorName?: string;
}

export interface SlotWriteDto {
  label: string;
  capacityPerDay?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  /** DEC-DLV-007 — minutes from midnight. 9am = 540. */
  startMin?: number | null;
  endMin?: number | null;
  /** "08:00" — this slot's own last-order time. null = until it starts. */
  cutoffTime?: string | null;
}

/** DEC-DLV-008 — a delivery NAME, shop-wide. Product upload shows these. */
export interface TypeWriteDto {
  name: string;
  zone?: 'DHAKA' | 'BANGLADESH';
  kind?: 'RIDER' | 'COURIER';
  sortOrder?: number;
  isActive?: boolean;
  /** DEC-DLV-010 — এই delivery কোন ছাঁচের */
  timing?:
    | 'FROM_CONFIRM'
    | 'TODAY_SLOT'
    | 'PICK_DATE_SLOT'
    | 'PICK_DATE_FIXED'
    | 'LEAD_DAYS';
  /** FROM_CONFIRM হলে কত মিনিটের প্রতিশ্রুতি। ২ ঘণ্টা = 120। */
  promiseMinutes?: number | null;
  /** দিনের কোন সময়টায় এই delivery নেওয়া যাবে। মিনিটে, ১০টা = 600। */
  openFromMin?: number | null;
  openToMin?: number | null;
}

/** DEC-DLV-007 — a zone or an area inside one. `parentId` null = a zone. */
export interface AreaWriteDto {
  name: string;
  parentId?: string | null;
  zone?: 'DHAKA' | 'BANGLADESH';
  sortOrder?: number;
  isActive?: boolean;
}

export interface RiderWriteDto {
  name: string;
  phone?: string | null;
  vehicle?: string | null;
  photoUrl?: string | null;
  note?: string | null;
  isActive?: boolean;
}

export interface CourierWriteDto {
  name: string;
  phone?: string | null;
  trackingUrlTemplate?: string | null;
  note?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface AssignDto {
  orderId: string;
  kind: 'RIDER' | 'COURIER';
  riderId?: string;
  courierId?: string;
  consignmentNo?: string;
  note?: string;
  actorName?: string;
}

export interface AssignmentActionDto {
  actorName?: string;
  failReason?: string;
  consignmentNo?: string;
}

/** What the fulfilment list is asking for. Everything optional — no filter
 *  chosen means the whole queue, which is what the screen opens on. */
export interface BoardQuery {
  status?: 'unassigned' | 'preparing' | 'out_for_delivery' | 'failed';
  zone?: 'DHAKA' | 'BANGLADESH';
  methodId?: string;
  /** order number, phone, recipient, address or customer name */
  q?: string;
  page?: number;
  limit?: number;
}

/*  No `consignmentNo` here, on purpose. A consignment number belongs to ONE
    parcel; a single number pasted across forty of them would be forty wrong
    tracking links sent to forty customers. Bulk picks the carrier — the
    numbers are typed per parcel afterwards, or arrive from the courier. */
export interface BulkAssignDto {
  orderIds: string[];
  kind: 'RIDER' | 'COURIER';
  riderId?: string;
  courierId?: string;
  note?: string;
  actorName?: string;
}

/*  SETTLING A CARRIER — DEC-DLV-016/017.

    One line per parcel. `codPaisa` is what the carrier actually handed over for
    it, which is NOT assumed to equal what was due: a short payment is a fact
    worth recording, not an error to reject. `chargePaisa` is what they charged
    to carry it, and it is written onto the parcel — the parcel is what posts to
    Delivery Cost.

    A prepaid parcel appears here too, with `codPaisa` 0. There is no cash to
    reconcile, but the rider still had to be paid, and a screen that only listed
    COD parcels would quietly lose every prepaid delivery's cost. */
export interface SettleLineDto {
  assignmentId: string;
  codPaisa?: number;
  chargePaisa?: number;
}

export interface SettleDto {
  carrierType: 'RIDER' | 'COURIER';
  carrierId: string;
  /** where the net money landed — a Finance money account */
  intoAccountId?: string;
  receivedAt?: string;
  lines: SettleLineDto[];
  note?: string;
  actorName?: string;
}
