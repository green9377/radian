import ProductEditor from "../../_components/ProductEditor";

/*
  /products/[slug] — edit。 Next 16-এ params Promise, তাই await।
*/
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProductEditor slug={slug} />;
}
