import { LEARNING_PATH } from "@/lib/constants";
import { EmbedViz } from "./viz";

export function generateStaticParams() {
  return LEARNING_PATH.map((version) => ({ version }));
}

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ locale: string; version: string }>;
}) {
  const { version } = await params;
  return <EmbedViz version={version} />;
}
