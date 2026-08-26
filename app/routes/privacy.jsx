/* global globalThis */
import { useLoaderData } from "react-router";

const pageStyle = { maxWidth: "760px", margin: "48px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6, color: "#3B2E24" };

function legal() {
  return {
    entity: globalThis.process?.env?.LEGAL_ENTITY_NAME || "l’éditeur de FolioMise",
    privacyEmail: globalThis.process?.env?.PRIVACY_CONTACT_EMAIL || globalThis.process?.env?.SUPPORT_EMAIL || "support@foliomise.app",
  };
}

export const meta = () => [{ title: "Confidentialité — FolioMise" }];
export const loader = () => legal();

export default function PrivacyPage() {
  const { entity, privacyEmail } = useLoaderData();
  return (
    <main style={pageStyle}>
      <h1>Politique de confidentialité de FolioMise</h1>
      <p>Dernière mise à jour : 26 août 2026. FolioMise est éditée par {entity}.</p>
      <h2>Données traitées</h2>
      <p>Pour générer les catalogues, FolioMise lit les produits, collections, menus, images et métadonnées autorisés par la boutique. Elle conserve les réglages de marque, les informations de session nécessaires à l’accès à l’application, ainsi que l’historique des catalogues et flipbooks créés.</p>
      <h2>Hébergement et finalité</h2>
      <p>Les données applicatives sont hébergées dans PostgreSQL, les tâches de génération dans Redis et les fichiers PDF/flipbooks dans Cloudflare R2. Elles servent uniquement à fournir, sécuriser et maintenir le service demandé par le marchand.</p>
      <h2>Partage et conservation</h2>
      <p>Un flipbook n’est accessible publiquement que par son lien secret, tant que le marchand ne le révoque pas. Lorsqu’une boutique désinstalle l’application, les données et fichiers associés sont supprimés à réception de la demande d’effacement de Shopify.</p>
      <h2>Vos droits et contact</h2>
      <p>Pour toute question ou demande relative aux données, contactez <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>. Cette politique ne remplace pas un avis juridique adapté à votre activité.</p>
    </main>
  );
}
