import { API_BASE } from "./shop";

/*
  Loads the tag ids the admin saved (GET /marketing/tracking/public) and puts
  the actual scripts on the page. One module owns every vendor snippet, so a
  new pixel is a paste in the admin, not a code change.

  Everything is guarded: no config, no scripts; a vendor object missing means
  that vendor is skipped, never an error. Tracking must not be able to break
  the shop.
*/

export type TrackEvent =
  | "PageView"
  | "ViewContent"
  | "Search"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

interface TrackingConfig {
  enabled: boolean;
  testMode?: boolean;
  gtmId?: string | null;
  metaPixelId?: string | null;
  ga4MeasurementId?: string | null;
  googleAdsId?: string | null;
  googleAdsConversionLabel?: string | null;
  tiktokPixelId?: string | null;
  snapPixelId?: string | null;
  pinterestTagId?: string | null;
  clarityId?: string | null;
}

interface TtqLike {
  track: (name: string, data?: Record<string, unknown>) => void;
  page: () => void;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: TtqLike;
    snaptr?: (...args: unknown[]) => void;
    pintrk?: (...args: unknown[]) => void;
  }
}

let cfg: TrackingConfig | null = null;
let started = false;

const addScript = (src: string) => {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
};
const addInline = (code: string) => {
  const s = document.createElement("script");
  s.innerHTML = code;
  document.head.appendChild(s);
};

export async function initTracking(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;

  try {
    const res = await fetch(`${API_BASE}/marketing/tracking/public`);
    cfg = (await res.json()) as TrackingConfig;
  } catch {
    return; // API unreachable — the shop must still work
  }
  if (!cfg?.enabled) return;

  if (cfg.gtmId) {
    addInline(
      `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${cfg.gtmId}');`,
    );
  }

  if (cfg.ga4MeasurementId || cfg.googleAdsId) {
    const first = cfg.ga4MeasurementId || cfg.googleAdsId;
    addScript(`https://www.googletagmanager.com/gtag/js?id=${first}`);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    const extra = cfg.testMode ? { debug_mode: true } : {};
    if (cfg.ga4MeasurementId) window.gtag("config", cfg.ga4MeasurementId, extra);
    if (cfg.googleAdsId) window.gtag("config", cfg.googleAdsId);
  }

  if (cfg.metaPixelId) {
    addInline(
      `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${cfg.metaPixelId}');fbq('track','PageView');`,
    );
  }

  if (cfg.clarityId) {
    addInline(
      `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${cfg.clarityId}");`,
    );
  }

  if (cfg.tiktokPixelId) {
    addInline(
      `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${cfg.tiktokPixelId}');ttq.page();}(window,document,'ttq');`,
    );
  }

  if (cfg.snapPixelId) {
    addInline(
      `(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u);})(window,document,'https://sc-static.net/scevent.min.js');snaptr('init','${cfg.snapPixelId}');snaptr('track','PAGE_VIEW');`,
    );
  }

  if (cfg.pinterestTagId) {
    addInline(
      `!function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var n=window.pintrk;n.queue=[],n.version="3.0";var t=document.createElement("script");t.async=!0,t.src=e;var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");pintrk('load','${cfg.pinterestTagId}');pintrk('page');`,
    );
  }
}

/* one event name in, every installed vendor told in its own dialect */
const GA4_NAME: Record<TrackEvent, string> = {
  PageView: "page_view",
  ViewContent: "view_item",
  Search: "search",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
  Purchase: "purchase",
};
const TIKTOK_NAME: Record<TrackEvent, string> = {
  PageView: "Pageview",
  ViewContent: "ViewContent",
  Search: "Search",
  AddToCart: "AddToCart",
  InitiateCheckout: "InitiateCheckout",
  Purchase: "CompletePayment",
};

export function track(event: TrackEvent, data: Record<string, unknown> = {}): void {
  if (typeof window === "undefined" || !cfg?.enabled) return;

  try {
    window.dataLayer?.push({ event, ...data });

    if (window.fbq) {
      if (event === "PageView") window.fbq("track", "PageView");
      else window.fbq("track", event, data);
    }

    if (window.gtag) {
      window.gtag("event", GA4_NAME[event], data);
      // A paid click is only worth reporting when it ends in money.
      if (event === "Purchase" && cfg.googleAdsId && cfg.googleAdsConversionLabel) {
        window.gtag("event", "conversion", {
          send_to: `${cfg.googleAdsId}/${cfg.googleAdsConversionLabel}`,
          value: data.value,
          currency: data.currency ?? "BDT",
          transaction_id: data.transaction_id,
        });
      }
    }

    if (window.ttq) {
      if (event === "PageView") window.ttq.page();
      else window.ttq.track(TIKTOK_NAME[event], data);
    }

    if (window.snaptr) {
      const SNAP: Record<TrackEvent, string> = {
        PageView: "PAGE_VIEW", ViewContent: "VIEW_CONTENT", Search: "SEARCH",
        AddToCart: "ADD_CART", InitiateCheckout: "START_CHECKOUT", Purchase: "PURCHASE",
      };
      window.snaptr("track", SNAP[event], data);
    }

    if (window.pintrk) {
      const PIN: Partial<Record<TrackEvent, string>> = {
        PageView: "pagevisit", Search: "search", AddToCart: "addtocart", Purchase: "checkout",
      };
      const name = PIN[event];
      if (name) window.pintrk("track", name, data);
    }
  } catch {
    /* a broken pixel must never break the shop */
  }
}
