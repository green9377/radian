import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './catalog/categories';
import { BrandsModule } from './catalog/brands';
import { UnitsModule } from './catalog/units';
import { TagGroupsModule } from './catalog/tag-groups';
import { TagsModule } from './catalog/tags';
import { VariantGroupsModule } from './catalog/variant-groups';
import { SegmentsModule } from './catalog/segments';
import { ChannelsModule } from './catalog/channels';
import { AddOnsModule } from './catalog/addons';
import { BundlesModule } from './catalog/bundles';
import { CraftModule } from './catalog/craft';
import { CategoryStoryModule } from './catalog/category-story';
import { CapacityModule } from './catalog/capacity';
import { VariantAttributesModule } from './catalog/variant-attributes';
import { ItemsModule } from './items/items.module';
import { ItemCategoriesModule } from './catalog/item-categories';
import { ItemAttributesModule } from './catalog/item-attributes';
import { ItemTypesModule } from './catalog/item-types';
import { CustomersModule } from './customers/customers.module';
import { OrdersModule } from './orders/orders.module';
import { MessagingModule } from './messaging/messaging.controller';
import { PurchasesModule } from './purchases/purchases.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { InventoryModule } from './inventory/inventory.module';
import { AssemblyModule } from './assembly/assembly.module';
import { PosModule } from './pos/pos.module';
import { ReturnsModule } from './returns/returns.module';
import { OffersModule } from './offers/offers.module';
import { DeliveryModule } from './delivery/delivery.module';
import { FinanceModule } from './finance/finance.module';
import { HrModule } from './hr/hr.module';
import { MarketingModule } from './marketing/marketing.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { AuditModule } from './audit/audit.module';
import { SeoModule } from './seo/seo.module';
import { AuthModule } from './auth/auth.module';
import { AdministrationModule } from './administration/administration.module';
import { ShopModule } from './shop/shop';
import { ProductDetailModule } from './shop/product-detail';
import { ShopCatalogModule } from './shop/catalog';
import { CheckoutModule } from './shop/checkout';
import { PaymentModule } from './shop/payment';
import { MediaModule } from './media/media';
import { BannersModule } from './storefront/banners';
import { TrustModule } from './storefront/trust';
import { SectionsModule } from './storefront/sections';
import { CollectionsModule } from './storefront/collections';
import { HoursModule } from './storefront/hours';
import { FooterModule } from './storefront/footer';
import { ReviewsModule } from './storefront/reviews';
import { LayoutModule } from './storefront/layout';
import { HomeContentModule } from './storefront/home-content';
import { ContentModule } from './content/content.module';
import { InboxModule } from './inbox/inbox';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    ProductsModule,
    CategoriesModule,
    BrandsModule,
    UnitsModule,
    TagGroupsModule,
    TagsModule,
    VariantGroupsModule,
    SegmentsModule,
    ChannelsModule,
    AddOnsModule,
    BundlesModule,
    CraftModule,
    /*  DEC-PRD-023 — product page-এর trust badge আর "What's inside",
        category-তে একবার লেখা।  */
    CategoryStoryModule,
    CapacityModule,
    VariantAttributesModule,
    ItemsModule,
    ItemCategoriesModule,
    ItemAttributesModule,
    ItemTypesModule,
    CustomersModule,
    OrdersModule,
    MessagingModule, // হারানো order ফেরানো + বার্তার হিসাব (DEC-WA-002…008)
    PurchasesModule,
    SuppliersModule,
    InventoryModule,
    AssemblyModule,
    PosModule,
    ReturnsModule,
    OffersModule,
    DeliveryModule,
    FinanceModule,
    HrModule,
    MarketingModule,
    IntelligenceModule,
    AuditModule,
    SeoModule,
    AuthModule,
    AdministrationModule,
    ShopModule,
    ProductDetailModule,
    ShopCatalogModule,
    CheckoutModule,
    PaymentModule,
    MediaModule,
    BannersModule,
    TrustModule,
    SectionsModule,
    CollectionsModule,
    HoursModule,
    FooterModule,
    ReviewsModule,
    LayoutModule,
    HomeContentModule,
    ContentModule,
    InboxModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
