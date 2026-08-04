import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/auth.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** the "is the API alive" ping — deliberately open, it reveals nothing */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /*  Deploy-এর health check এবং "ঘুম ঠেকানো" ping এখানে আসে।

      ⚠️ এটা ইচ্ছাকৃতভাবে DATABASE ছোঁয় না, এবং কখনো ছোঁবে না।

      কারণ: ফ্রি hosting-এ দুটো ঘড়ি একসাথে চলে —
        • API service ১৫ মিনিট নীরব থাকলে ঘুমায় (পরের ক্লিকে ~১ মিনিট সাদা পর্দা)
        • ফ্রি Postgres-এ মাসে সীমিত compute-hour, ৫ মিনিট নীরব থাকলে সে-ও ঘুমায়
      প্রতি ১০ মিনিটে এখানে একটা ping করলে API জেগে থাকে, কিন্তু DB ঘুমিয়েই
      থাকে — তাই মাসের কোটা পোড়ে না। এখানে একটাও query যোগ করলে সেই
      হিসাবটা ভেঙে যাবে। DB সত্যিই বেঁচে আছে কিনা দেখতে `/products` ডাকুন।  */
  @Public()
  @Get('health')
  health() {
    return {
      ok: true,
      at: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
    };
  }
}
