import { Injectable } from '@nestjs/common';

/*
  Staff-উপস্থিতি — DEC-INB-008 rev (৫ আগস্ট)।

  "Active" মানে: কোনো staff-এর admin Inbox পর্দাটা খোলা। পর্দাটা এমনিতেই
  প্রতি ১০ সেকেন্ডে তালিকা টানে — সেই request-ই নাড়ির স্পন্দন; আলাদা
  heartbeat endpoint বানানোর দরকার নেই।

  ইচ্ছা করে in-memory (DB নয়): উপস্থিতি ক্ষণস্থায়ী সত্য, আর ভুলের দিকটাও
  নিরাপদ — deploy/restart-এ খালি map মানে "কেউ নেই" ধরা হয়, তখন AI সাথে
  সাথে উত্তর দেয়। গ্রাহকের দিক থেকে সেটা কখনোই ক্ষতি না।
*/

const ACTIVE_WINDOW_MS = 60_000;

@Injectable()
export class InboxPresence {
  private readonly lastSeen = new Map<string, number>();

  touch(userId: string | undefined): void {
    if (userId) this.lastSeen.set(userId, Date.now());
  }

  anyStaffActive(): boolean {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    for (const t of this.lastSeen.values()) if (t > cutoff) return true;
    return false;
  }
}
