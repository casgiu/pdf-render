const MAX_LABEL_LENGTH = 160;

/** Validate and normalize the only fields accepted when starting a catalogue. */
export function parseCatalogueJobInput(formData) {
  const type = formData.get("type");
  const rawCollectionId = formData.get("collectionId");
  const rawLabel = formData.get("label");

  if (type !== "full" && type !== "collection") {
    return { error: "Le type de catalogue est invalide." };
  }

  const collectionId = typeof rawCollectionId === "string" ? rawCollectionId.trim() : "";
  if (type === "collection" && !collectionId) {
    return { error: "Une collection est requise." };
  }
  if (collectionId.length > 255) {
    return { error: "L’identifiant de collection est invalide." };
  }

  const defaultLabel = type === "full" ? "Catalogue complet" : "Collection";
  const label = typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim() : defaultLabel;
  if (label.length > MAX_LABEL_LENGTH) {
    return { error: `Le libellé ne peut pas dépasser ${MAX_LABEL_LENGTH} caractères.` };
  }

  return { type, collectionId: type === "collection" ? collectionId : null, label };
}
