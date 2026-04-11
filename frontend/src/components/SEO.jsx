import { Helmet } from "react-helmet-async";

/**
 * Per-page SEO component. Sets title, meta description, OG tags, structured data.
 */
export default function SEO({
  title,
  description,
  keywords,
  image = "https://athlyticai.com/icons/icon-512.png",
  url,
  type = "website",
  structuredData,
  noindex = false,
}) {
  const fullTitle = title ? `${title} | AthlyticAI` : "AthlyticAI - Your AI Sports Coach";
  const canonicalUrl =
    url || (typeof window !== "undefined" ? window.location.href : "https://athlyticai.com");

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content="AthlyticAI" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image} />

      {noindex && <meta name="robots" content="noindex,nofollow" />}

      {structuredData && (
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      )}
    </Helmet>
  );
}
