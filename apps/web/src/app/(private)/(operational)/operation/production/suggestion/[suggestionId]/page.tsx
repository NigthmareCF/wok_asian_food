import { ProductionSuggestionView } from "@/modules/production";
import { ProductionSessionProvider } from "@/modules/production";

interface ProductionSuggestionPageProps {
  params: Promise<{ suggestionId: string }>;
}

export default async function ProductionSuggestionPage({
  params,
}: ProductionSuggestionPageProps) {
  const { suggestionId } = await params;
  return (
    <ProductionSessionProvider>
      <ProductionSuggestionView suggestionId={suggestionId} />
    </ProductionSessionProvider>
  );
}