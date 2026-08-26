import { redirect } from "react-router";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>FolioMise</h1>
        <p className={styles.text}>
          Génère des catalogues PDF à partir des produits de la boutique,
          classés par collection ou par catégorie.
        </p>
        <p className={styles.text}>
          Installez FolioMise depuis le Shopify App Store pour commencer à créer vos catalogues.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Catalogue par collection</strong>. Un PDF pour une seule
            collection, avec photos, prix et caractéristiques produit.
          </li>
          <li>
            <strong>Catalogue complet</strong>. Tous les produits actifs,
            organisés selon le menu de navigation que vous choisissez.
          </li>
          <li>
            <strong>Toujours à jour</strong>. Généré à la demande depuis les
            données actuelles de la boutique (produits actifs uniquement).
          </li>
        </ul>
      </div>
    </div>
  );
}
