import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { listCollections } from "../lib/shopify-data.server";

const buttonStyle = {
  display: "inline-block",
  padding: "8px 16px",
  background: "#3B2E24",
  color: "#F5F1EA",
  border: "none",
  borderRadius: "4px",
  fontSize: "14px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const buttonStyleSmall = {
  ...buttonStyle,
  padding: "4px 10px",
  fontSize: "13px",
};

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const collections = await listCollections(admin);
  const withProducts = collections
    .filter((c) => c.productsCount.count > 0)
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));

  return { collections: withProducts };
};

function filenameFromResponse(response, fallback) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  return match ? match[1] : fallback;
}

export default function CataloguePage({ loaderData }) {
  const { collections } = loaderData;
  const shopify = useAppBridge();
  // null = rien en cours, sinon l'identifiant du bouton en cours de génération
  // (permet de désactiver seulement ce bouton-là pendant l'attente).
  const [pendingId, setPendingId] = useState(null);

  async function downloadCatalogue(id, url, fallbackName) {
    setPendingId(id);
    try {
      // `fetch` est patché par AppProvider pour y attacher le jeton de session
      // Shopify — contrairement à une navigation <a href> classique, qui
      // n'est pas authentifiée et atterrit sur la page de rebond OAuth.
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Le serveur a répondu ${response.status}`);
      }
      const blob = await response.blob();
      const filename = filenameFromResponse(response, fallbackName);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      shopify.toast.show(`Échec du téléchargement : ${err.message}`, { isError: true });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <s-page heading="Catalogues PDF">
      <s-section heading="Catalogue complet">
        <s-paragraph>
          Un seul PDF avec tous les produits actifs, classés par les 7
          catégories du menu principal (Salons, Salle à manger, Chambres,
          Luminaires, Professionnels, Extérieur, Décorations). La génération
          peut prendre plusieurs minutes selon le nombre de produits.
        </s-paragraph>
        <button
          type="button"
          style={buttonStyle}
          disabled={pendingId === "full"}
          onClick={() =>
            downloadCatalogue("full", "/app/catalogue/download?type=full", "catalogue-complet.pdf")
          }
        >
          {pendingId === "full" ? "Génération en cours…" : "Télécharger le catalogue complet"}
        </button>
      </s-section>

      <s-section heading="Par collection">
        <s-paragraph>
          Génère un catalogue PDF pour une seule collection.
        </s-paragraph>
        <s-table>
          <s-table-header-row>
            <s-table-header>Collection</s-table-header>
            <s-table-header>Produits</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {collections.map((c) => (
              <s-table-row key={c.id}>
                <s-table-cell>{c.title}</s-table-cell>
                <s-table-cell>{c.productsCount.count}</s-table-cell>
                <s-table-cell>
                  <button
                    type="button"
                    style={buttonStyleSmall}
                    disabled={pendingId === c.id}
                    onClick={() =>
                      downloadCatalogue(
                        c.id,
                        `/app/catalogue/download?type=collection&collection=${encodeURIComponent(c.id)}`,
                        `catalogue-${c.handle}.pdf`,
                      )
                    }
                  >
                    {pendingId === c.id ? "Génération…" : "Télécharger"}
                  </button>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}
