import { authenticate } from "../shopify.server";
import { listCollections } from "../lib/shopify-data.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const collections = await listCollections(admin);
  const withProducts = collections
    .filter((c) => c.productsCount.count > 0)
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));

  return { collections: withProducts };
};

export default function CataloguePage({ loaderData }) {
  const { collections } = loaderData;

  return (
    <s-page heading="Catalogues PDF">
      <s-section heading="Catalogue complet">
        <s-paragraph>
          Un seul PDF avec tous les produits actifs, classés par les 7
          catégories du menu principal (Salons, Salle à manger, Chambres,
          Luminaires, Professionnels, Extérieur, Décorations).
        </s-paragraph>
        <s-button href="/app/catalogue/download?type=full" target="_blank" variant="primary">
          Télécharger le catalogue complet
        </s-button>
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
                  <s-button
                    href={`/app/catalogue/download?type=collection&collection=${encodeURIComponent(c.id)}`}
                    target="_blank"
                  >
                    Télécharger
                  </s-button>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}
