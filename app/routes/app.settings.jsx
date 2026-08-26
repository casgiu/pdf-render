import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import PropTypes from "prop-types";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getTheme, saveTheme, FONT_FAMILIES } from "../lib/theme.server";
import { listMenus } from "../lib/shopify-data.server";

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

const fieldRowStyle = { display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" };
const labelStyle = { width: "220px", fontSize: "14px" };
const textInputStyle = { flex: 1, maxWidth: "420px", padding: "6px 8px", fontSize: "14px", fontFamily: "inherit" };

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const [theme, menus] = await Promise.all([getTheme(session.shop), listMenus(admin)]);
  const fontOptions = Object.entries(FONT_FAMILIES).map(([key, f]) => ({ key, label: f.label }));
  return { theme, fontOptions, menus };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  await saveTheme(session.shop, {
    backgroundColor: formData.get("backgroundColor"),
    textColor: formData.get("textColor"),
    accentColor: formData.get("accentColor"),
    mutedColor: formData.get("mutedColor"),
    lineColor: formData.get("lineColor"),
    fontFamily: formData.get("fontFamily"),
    tagline: formData.get("tagline"),
    presentationText: formData.get("presentationText"),
    brandName: formData.get("brandName"),
    logoUrl: formData.get("logoUrl"),
    mainMenuHandle: formData.get("mainMenuHandle"),
  });
  return { ok: true };
};

function ColorField({ name, label, value, onChange }) {
  return (
    <div style={fieldRowStyle}>
      <label style={labelStyle} htmlFor={name}>{label}</label>
      <input
        type="color"
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "44px", height: "32px", padding: 0, border: "1px solid #D8CFC0", borderRadius: "4px" }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...textInputStyle, maxWidth: "110px" }}
      />
    </div>
  );
}

ColorField.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default function SettingsPage() {
  const loaderData = useLoaderData();
  const { theme, fontOptions, menus } = loaderData;
  const shopify = useAppBridge();
  const [values, setValues] = useState({
    backgroundColor: theme.backgroundColor,
    textColor: theme.textColor,
    accentColor: theme.accentColor,
    mutedColor: theme.mutedColor,
    lineColor: theme.lineColor,
    fontFamily: theme.fontFamily,
    tagline: theme.tagline,
    presentationText: theme.presentationText,
    brandName: theme.brandName,
    logoUrl: theme.logoUrl,
    mainMenuHandle: theme.mainMenuHandle,
  });
  const [saving, setSaving] = useState(false);

  function set(field) {
    return (value) => setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = new FormData();
      Object.entries(values).forEach(([k, v]) => body.set(k, v));
      const res = await fetch("/app/settings", { method: "POST", body });
      if (!res.ok) throw new Error(`Le serveur a répondu ${res.status}`);
      shopify.toast.show("Réglages enregistrés");
    } catch (err) {
      shopify.toast.show(`Échec de l'enregistrement : ${err.message}`, { isError: true });
    } finally {
      setSaving(false);
    }
  }

  async function detectIdentity() {
    setSaving(true);
    try {
      const res = await fetch("/app/brand-detection", { method: "POST" });
      const contentType = res.headers.get("Content-Type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Le serveur a renvoyé une réponse inattendue (${res.status}).`);
      }
      const detected = await res.json();
      if (!res.ok) throw new Error(detected.error || `Le serveur a répondu ${res.status}`);
      setValues((prev) => ({
        ...prev,
        brandName: detected.name || prev.brandName,
        logoUrl: detected.logoUrl || prev.logoUrl,
      }));
      if (detected.warning) shopify.toast.show(`Nom détecté. Logo indisponible : ${detected.warning}`, { isError: true });
      else if (detected.logoUrl) shopify.toast.show("Identité détectée. Vérifie l'aperçu puis enregistre.");
      else shopify.toast.show("Nom détecté, mais aucun logo fiable n'a été trouvé.");
    } catch (err) {
      shopify.toast.show(`Échec de l'analyse : ${err.message}`, { isError: true });
    } finally {
      setSaving(false);
    }
  }

  const fontLabel = fontOptions.find((f) => f.key === values.fontFamily)?.label || values.fontFamily;

  function suggestPresentationText() {
    const brandName = values.brandName?.trim() || "Notre maison";
    set("presentationText")(
      `${brandName} propose une sélection de mobilier et de décoration pensée pour sublimer chaque intérieur.\n\n` +
      "Chaque pièce est choisie avec soin pour sa qualité, ses matériaux et son caractère durable. Découvrez nos collections, leurs prix et les dimensions disponibles.",
    );
  }

  return (
    <s-page heading="Personnalisation du catalogue">
      <s-section heading="Couleurs">
        <s-paragraph>
          Ces couleurs sont utilisées sur toutes les pages du catalogue (couverture, fiches produit,
          séparateurs de catégorie). Les valeurs actuelles correspondent à l&apos;identité Homa Home.
        </s-paragraph>
        <form onSubmit={handleSubmit}>
          <div style={fieldRowStyle}>
            <span style={labelStyle}>Identité de marque</span>
            <button type="button" style={buttonStyle} onClick={detectIdentity} disabled={saving}>
              Analyser automatiquement le site
            </button>
          </div>
          <s-paragraph>
            L&apos;analyse reprend le nom de la boutique puis cherche un logo dans l&apos;en-tête de la page d&apos;accueil.
            Vérifie toujours le résultat avant de l&apos;enregistrer.
          </s-paragraph>
          <div style={fieldRowStyle}>
            <label style={labelStyle} htmlFor="brandName">Nom de la marque</label>
            <input id="brandName" name="brandName" value={values.brandName} onChange={(e) => set("brandName")(e.target.value)} style={textInputStyle} />
          </div>
          <div style={fieldRowStyle}>
            <label style={labelStyle} htmlFor="logoUrl">URL du logo</label>
            <input id="logoUrl" name="logoUrl" type="url" placeholder="https://…" value={values.logoUrl} onChange={(e) => set("logoUrl")(e.target.value)} style={textInputStyle} />
          </div>
          {values.logoUrl && (
            <div style={{ ...fieldRowStyle, alignItems: "flex-start" }}>
              <span style={labelStyle}>Aperçu du logo</span>
              <img src={values.logoUrl} alt="Logo sélectionné" style={{ maxWidth: "180px", maxHeight: "70px", objectFit: "contain", border: "1px solid #D8CFC0", padding: "6px" }} />
            </div>
          )}
          <div style={fieldRowStyle}>
            <label style={labelStyle} htmlFor="mainMenuHandle">Menu du catalogue complet</label>
            <select
              id="mainMenuHandle"
              name="mainMenuHandle"
              value={values.mainMenuHandle}
              onChange={(e) => set("mainMenuHandle")(e.target.value)}
              style={{ ...textInputStyle, maxWidth: "420px" }}
            >
              <option value="">Utiliser les catégories historiques</option>
              {menus.map((menu) => (
                <option key={menu.handle} value={menu.handle}>{menu.title}</option>
              ))}
            </select>
          </div>
          <s-paragraph>
            Les entrées de ce menu qui pointent vers des collections deviennent les sections du catalogue,
            dans le même ordre. Les pages et liens externes sont ignorés.
          </s-paragraph>
          <ColorField name="backgroundColor" label="Fond (couverture, séparateurs)" value={values.backgroundColor} onChange={set("backgroundColor")} />
          <ColorField name="textColor" label="Texte principal" value={values.textColor} onChange={set("textColor")} />
          <ColorField name="accentColor" label="Accent (prix, accroche)" value={values.accentColor} onChange={set("accentColor")} />
          <ColorField name="mutedColor" label="Texte secondaire" value={values.mutedColor} onChange={set("mutedColor")} />
          <ColorField name="lineColor" label="Lignes de séparation" value={values.lineColor} onChange={set("lineColor")} />

          <div style={fieldRowStyle}>
            <label style={labelStyle} htmlFor="fontFamily">Police</label>
            <select
              id="fontFamily"
              name="fontFamily"
              value={values.fontFamily}
              onChange={(e) => set("fontFamily")(e.target.value)}
              style={{ ...textInputStyle, maxWidth: "280px" }}
            >
              {fontOptions.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>

          <div style={fieldRowStyle}>
            <label style={labelStyle} htmlFor="tagline">Accroche (page de couverture)</label>
            <input
              type="text"
              id="tagline"
              name="tagline"
              value={values.tagline}
              onChange={(e) => set("tagline")(e.target.value)}
              style={textInputStyle}
            />
          </div>

          <div style={{ ...fieldRowStyle, alignItems: "flex-start" }}>
            <label style={{ ...labelStyle, paddingTop: "7px" }} htmlFor="presentationText">Texte de présentation (page 2)</label>
            <div style={{ flex: 1, maxWidth: "620px" }}>
              <textarea
                id="presentationText"
                name="presentationText"
                value={values.presentationText}
                onChange={(e) => set("presentationText")(e.target.value)}
                placeholder="Saisissez le texte qui doit apparaître sur la deuxième page du catalogue."
                rows={8}
                style={{ ...textInputStyle, width: "100%", maxWidth: "none", resize: "vertical", lineHeight: 1.45 }}
              />
              <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
                <button type="button" style={buttonStyle} onClick={suggestPresentationText}>
                  Générer un texte suggéré
                </button>
                <span style={{ fontSize: "12px", color: "#6B6259" }}>
                  Si ce champ est vide, le texte actuel du catalogue est conservé.
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "20px",
              marginBottom: "20px",
              padding: "24px",
              background: values.backgroundColor,
              border: "1px solid #D8CFC0",
              borderRadius: "6px",
              textAlign: "center",
            }}
          >
            <div style={{ color: values.textColor, fontSize: "18px", fontWeight: "bold" }}>Catalogue — Aperçu</div>
            <div style={{ color: values.accentColor, fontStyle: "italic", marginTop: "6px" }}>{values.tagline}</div>
            <div style={{ color: values.mutedColor, fontSize: "12px", marginTop: "6px" }}>
              Police PDF : {fontLabel}
            </div>
          </div>

          <button type="submit" style={buttonStyle} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </form>
      </s-section>
    </s-page>
  );
}
