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
  /** DEC-DLV-018 — which slot master this connection was made from */
  templateId?: string | null;
}

/** DEC-DLV-019 — one paused day. No typeId = every delivery pauses that day. */
export interface BlackoutWriteDto {
  date: string; // YYYY-MM-DD
  reason?: string | null;
  typeId?: string | null;
}

/** DEC-DLV-020 — the enforced rule switches (photo gates) */
export interface DeliverySettingsDto {
  requirePrepPhoto?: boolean;
  requireDeliveryPhoto?: boolean;
}

/** DEC-DLV-018 — a slot MASTER: made once, connected to zone-methods in Setup */
export interface SlotTemplateWriteDto {
  label?: string;
  startMin?: number | null;
  endMin?: number | null;
  cutoffTime?: string | null;
  capacityPerDay?: number | null;
  sortOrder?: number;
  isActive?: boolean;
}

/** DEC-DLV-008 — a delivery NAME, shop-wide. Product upload shows these. */
export interface TypeWriteDto {
  name: string;
  zone?: 'DHAKA' | 'BANGLADESH';
  kind?: 'RIDER' | 'COURIER';
  sortOrder?: number;
  isActive?: boolean;
  /** DEC-DLV-010 — which shape this delivery follows */
  timing?:
    | 'FROM_CONFIRM'
    | 'TODAY_SLOT'
    | 'PICK_DATE_SLOT'
    | 'PICK_DATE_FIXED'
    | 'LEAD_DAYS';
  /** for FROM_CONFIRM: the promise in minutes. 2 hours = 120. */
  promiseMinutes?: number | null;
  /** which part of the day this delivery can be taken. Minutes, 10am = 600. */
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
  kind: 'RIDER' | 'COURIER' | 'ONE_TIME';
  riderId?: string;
  courierId?: string;
  consignmentNo?: string;
  /** ONE_TIME (owner, 10 Sep 2026): Pathao ride / Uber / other — no Rider row */
  platform?: string;
  riderPhone?: string;
  /** what was paid for this trip, when known at assign time */
  costPaisa?: number;
  /** the fare was handed over in cash at the door */
  paidCash?: boolean;
  note?: string;
  actorName?: string;
}

export interface AssignmentActionDto {
  actorName?: string;
  /** DEC-DLV-022 — which reason off the list (ReasonMaster, DELIVERY_FAIL) */
  failReasonId?: string;
  /** the note typed with it; alone, it is the whole reason (older rows) */
  failReason?: string;
  consignmentNo?: string;
  /** on fail (owner, 10 Sep 2026): what staff decided — RETRY | KEEP | CANCEL */
  decision?: 'RETRY' | 'KEEP' | 'CANCEL';
}

/** What the fulfilment list is asking for. Everything optional — no filter
 *  chosen means the whole queue, which is what the screen opens on. */
export interface BoardQuery {
  /** legacy: a raw delivery status. `seg` below is what the board sends now. */
  status?: 'unassigned' | 'preparing' | 'out_for_delivery' | 'failed' | 'delivered';
  /**
   * (audit 11 Sep 2026) the board's own tiles, decided server-side so the
   * counts are true for the whole day and not for the page that happened to
   * load. `all` = every parcel of the day that is NOT finished; `delivered`
   * = finished that day.
   */
  seg?: BoardSeg;
  zone?: 'DHAKA' | 'BANGLADESH';
  methodId?: string;
  /** order number, phone, recipient, address or customer name */
  q?: string;
  /** YYYY-MM-DD in Dhaka's day; blank = today. Ignored when scope = all. */
  date?: string;
  /** today (default: the chosen day + anything overdue) | all (every date) */
  scope?: 'today' | 'all';
  page?: number;
  /** rows per page — default 50, at most 200 */
  pageSize?: number;
  /** legacy alias of pageSize */
  limit?: number;
}

export type BoardSeg =
  | 'all'
  | 'notAssigned'
  | 'photoPending'
  | 'ready'
  | 'onRoad'
  | 'late'
  | 'failed'
  | 'delivered';

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
    it, which is NOT assumed to equal what was due — a part receipt simply
    leaves the parcel open for the rest. `chargePaisa` is what they charged
    to carry it, and it is written onto the parcel — the parcel is what posts to
    Delivery Cost.

    A prepaid parcel appears here too, with `codPaisa` 0. There is no cash to
    reconcile, but the rider still had to be paid, and a screen that only listed
    COD parcels would quietly lose every prepaid delivery's cost.

    (audit 11 Sep 2026) `chargePaisa` is OPTIONAL and means "record the fee":
    a line without it leaves the parcel's cost exactly as it was. "Cash
    received" alone used to write the fee as 0 and mark it recorded, which
    took the parcel off the "not paid" list for good. A FAILED attempt may be
    on a line too — cost only, never cash. */
export interface SettleLineDto {
  assignmentId: string;
  /** cash actually handed over for this parcel; 0 / absent = no receipt on this line */
  codPaisa?: number;
  /** the carrier's fee for this parcel. Absent = do not touch the recorded cost. */
  chargePaisa?: number;
  /**
   * the carrier kept `chargePaisa` out of the cash it handed over. Only then
   * is the fee netted off the receipt; otherwise the full COD is the receipt
   * and the fee is paid separately (it stays on the accrual).
   */
  feeKeptFromCash?: boolean;
}

export interface SettleDto {
  carrierType: 'RIDER' | 'COURIER' | 'ONE_TIME';
  carrierId: string;
  /** where the net money landed — a Finance money account */
  intoAccountId?: string;
  receivedAt?: string;
  lines: SettleLineDto[];
  note?: string;
  actorName?: string;
}
