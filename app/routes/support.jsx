/* global globalThis */
import { useLoaderData } from "react-router";

const pageStyle = { maxWidth: "760px", margin: "48px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6, color: "#3B2E24" };
export const meta = () => [{ title: "Assistance — FolioMise" }];
export const loader = () => ({ supportEmail: globalThis.process?.env?.SUPPORT_EMAIL || "support@foliomise.app" });

export default function SupportPage() {
  const { supportEmail } = useLoaderData();
  return (
    <main style={pageStyle}>
      <h1>Assistance FolioMise</h1>
      <p>Besoin d’aide pour personnaliser votre catalogue, lancer une génération ou partager un flipbook ?</p>
      <p>Écrivez à <a href={`mailto:${supportEmail}`}>{supportEmail}</a> en indiquant le nom de votre boutique et une description du problème. Ne transmettez jamais votre mot de passe Shopify.</p>
      <h2>Avant de nous contacter</h2>
      <ul>
        <li>Vérifiez que la boutique contient des produits actifs et des images produit.</li>
        <li>Choisissez un menu dont les entrées pointent vers des collections pour organiser le catalogue complet.</li>
        <li>Si un lien flipbook ne doit plus être partagé, révoquez-le depuis l’historique du catalogue.</li>
      </ul>
    </main>
  );
}
