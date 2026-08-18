import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Catalogues PDF Homa Home</h1>
        <p className={styles.text}>
          Génère des catalogues PDF à partir des produits de la boutique,
          classés par collection ou par catégorie.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Catalogue par collection</strong>. Un PDF pour une seule
            collection, avec photos, prix et caractéristiques produit.
          </li>
          <li>
            <strong>Catalogue complet</strong>. Tous les produits actifs,
            classés par les 7 catégories du menu principal.
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
