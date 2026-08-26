import { useEffect, useRef, useState } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { listCollections } from "../lib/shopify-data.server";
import { listRecentJobs } from "../lib/catalogue-jobs.server";
import { getTheme, isOnboardingComplete } from "../lib/theme.server";

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
  textDecoration: "none",
};

const buttonStyleSmall = { ...buttonStyle, padding: "4px 10px", fontSize: "13px" };

const STATUS_LABELS = {
  pending: "En attente…",
  running: "Génération en cours…",
  done: "Terminé",
  error: "Échec",
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const [collections, jobs, theme] = await Promise.all([
    listCollections(admin),
    listRecentJobs(session.shop),
    getTheme(session.shop),
  ]);
  const withProducts = collections
    .filter((c) => c.productsCount.count > 0)
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));

  return { collections: withProducts, jobs, setupComplete: isOnboardingComplete(theme) };
};

function filenameFromResponse(response, fallback) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  return match ? match[1] : fallback;
}

async function downloadBlob(url, fallbackName) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Le serveur a répondu ${response.status}`);
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
}

export default function CataloguePage() {
  const loaderData = useLoaderData();
  const { collections } = loaderData;
  const shopify = useAppBridge();
  const [jobs, setJobs] = useState(loaderData.jobs);
  const pollTimers = useRef({});

  useEffect(() => {
    const timers = pollTimers.current;
    // Reprend le suivi des jobs encore en cours au chargement de la page
    // (ex: on a relancé un catalogue complet puis fermé/rouvert l'app).
    for (const job of loaderData.jobs) {
      if (job.status === "pending" || job.status === "running") startPolling(job.id);
    }
    return () => {
      Object.values(timers).forEach(clearInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling(jobId) {
    if (pollTimers.current[jobId]) return;
    let lastStatus = null;
    let lastFlipbookStatus = null;
    pollTimers.current[jobId] = setInterval(async () => {
      try {
        const res = await fetch(`/app/catalogue/status/${jobId}`);
        if (!res.ok) return;
        const updated = await res.json();
        setJobs((prev) => {
          const exists = prev.some((j) => j.id === jobId);
          const next = exists
            ? prev.map((j) => (j.id === jobId ? { ...j, ...updated } : j))
            : [{ ...updated, createdAt: new Date().toISOString() }, ...prev];
          return next;
        });

        if (updated.status !== lastStatus && (updated.status === "done" || updated.status === "error")) {
          if (updated.status === "done") shopify.toast.show(`"${updated.label}" est prêt`);
          else shopify.toast.show(`Échec de "${updated.label}" : ${updated.errorMessage}`, { isError: true });
        }
        if (
          updated.flipbookStatus !== lastFlipbookStatus &&
          (updated.flipbookStatus === "done" || updated.flipbookStatus === "error")
        ) {
          if (updated.flipbookStatus === "done") shopify.toast.show(`Flipbook de "${updated.label}" prêt`);
          else shopify.toast.show(`Échec du flipbook : ${updated.flipbookError}`, { isError: true });
        }
        lastStatus = updated.status;
        lastFlipbookStatus = updated.flipbookStatus;

        const catalogueSettled = updated.status === "done" || updated.status === "error";
        const flipbookSettled = !updated.flipbookStatus || updated.flipbookStatus === "done" || updated.flipbookStatus === "error";
        if (catalogueSettled && flipbookSettled) {
          clearInterval(pollTimers.current[jobId]);
          delete pollTimers.current[jobId];
        }
      } catch {
        // on retentera au prochain tick
      }
    }, 2500);
  }

  async function startJob(type, collectionId, label) {
    const body = new FormData();
    body.set("type", type);
    body.set("label", label);
    if (collectionId) body.set("collectionId", collectionId);

    const res = await fetch("/app/catalogue/start", { method: "POST", body });
    if (!res.ok) {
      shopify.toast.show("Échec du lancement de la génération", { isError: true });
      return;
    }
    const { jobId, alreadyActive } = await res.json();
    setJobs((prev) => prev.some((job) => job.id === jobId)
      ? prev
      : [{ id: jobId, type, label, status: "pending", createdAt: new Date().toISOString() }, ...prev]);
    if (alreadyActive) shopify.toast.show("Une génération pour ce catalogue est déjà en cours.");
    startPolling(jobId);
  }

  async function startFlipbook(jobId) {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, flipbookStatus: "pending" } : j)));
    const res = await fetch(`/app/catalogue/flipbook/${jobId}`, { method: "POST" });
    if (!res.ok) {
      shopify.toast.show("Échec du lancement du flipbook", { isError: true });
      return;
    }
    startPolling(jobId);
  }

  async function revokeFlipbook(jobId) {
    const res = await fetch(`/app/catalogue/flipbook/${jobId}/revoke`, { method: "POST" });
    if (!res.ok) {
      shopify.toast.show("La révocation du flipbook a échoué", { isError: true });
      return;
    }
    setJobs((prev) => prev.map((job) => (job.id === jobId ? { ...job, flipbookPublished: false } : job)));
    shopify.toast.show("Le lien du flipbook a été révoqué");
  }

  const activeJobIds = new Set(
    jobs.filter((j) => j.status === "pending" || j.status === "running").map((j) => j.id),
  );
  const activeFlipbookIds = new Set(
    jobs.filter((j) => j.flipbookStatus === "pending" || j.flipbookStatus === "running").map((j) => j.id),
  );

  return (
    <s-page heading="Catalogues PDF">
      {!loaderData.setupComplete && (
        <s-section heading="Configurez FolioMise">
          <s-paragraph>
            1. Ajoutez votre identité de marque. 2. Choisissez le menu qui organise votre catalogue complet. 3. Générez votre premier catalogue.
          </s-paragraph>
          <a href="/app/settings" style={buttonStyle}>Configurer mon catalogue</a>
        </s-section>
      )}
      <s-section heading="Catalogue complet">
        <s-paragraph>
          Un seul PDF avec tous les produits actifs, organisé selon le menu choisi dans vos réglages.
          Sans menu sélectionné, FolioMise utilise vos collections actives. La génération se fait en arrière-plan.
        </s-paragraph>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => startJob("full", null, "Catalogue complet")}
        >
          Générer le catalogue complet
        </button>
      </s-section>

      <s-section heading="Par collection">
        <s-paragraph>Génère un catalogue PDF pour une seule collection.</s-paragraph>
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
                    onClick={() => startJob("collection", c.id, c.title)}
                  >
                    Générer
                  </button>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Historique">
        {jobs.length === 0 ? (
          <s-paragraph>Aucun catalogue généré pour l&apos;instant.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Catalogue</s-table-header>
              <s-table-header>Date</s-table-header>
              <s-table-header>Statut</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {jobs.map((job) => (
                <s-table-row key={job.id}>
                  <s-table-cell>{job.label}</s-table-cell>
                  <s-table-cell>
                    {new Date(job.createdAt).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </s-table-cell>
                  <s-table-cell>
                    {job.status === "error" ? `Échec : ${job.errorMessage}` : STATUS_LABELS[job.status]}
                  </s-table-cell>
                  <s-table-cell>
                    {job.status === "done" && (
                      <s-stack direction="inline" gap="base">
                        <button
                          type="button"
                          style={buttonStyleSmall}
                          onClick={() =>
                            downloadBlob(`/app/catalogue/file/${job.id}`, job.fileName || "catalogue.pdf").catch(
                              (err) => shopify.toast.show(`Échec : ${err.message}`, { isError: true }),
                            )
                          }
                        >
                          Télécharger
                        </button>

                        {!job.flipbookStatus && (
                          <button type="button" style={buttonStyleSmall} onClick={() => startFlipbook(job.id)}>
                            Créer un flipbook
                          </button>
                        )}
                        {activeFlipbookIds.has(job.id) && (
                          <s-spinner accessibilitylabel="Génération du flipbook en cours" size="base" />
                        )}
                        {job.flipbookStatus === "error" && (
                          <button type="button" style={buttonStyleSmall} onClick={() => startFlipbook(job.id)}>
                            Réessayer le flipbook
                          </button>
                        )}
                        {job.flipbookStatus === "done" && job.flipbookPublished && (
                          <>
                            <a href={`/flipbook/${job.flipbookToken}`} target="_blank" rel="noreferrer" style={buttonStyleSmall}>
                              Ouvrir le flipbook
                            </a>
                            <button type="button" style={buttonStyleSmall} onClick={() => revokeFlipbook(job.id)}>
                              Révoquer le lien
                            </button>
                          </>
                        )}
                        {job.flipbookStatus === "done" && !job.flipbookPublished && (
                          <s-paragraph>Flipbook révoqué.</s-paragraph>
                        )}
                      </s-stack>
                    )}
                    {activeJobIds.has(job.id) && <s-spinner accessibilitylabel="Génération en cours" size="base" />}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
