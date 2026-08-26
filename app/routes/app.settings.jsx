import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import PropTypes from "prop-types";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getTheme, saveTheme, FONT_FAMILIES } from "../lib/theme.server";

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
  const { session } = await authenticate.admin(request);
  const theme = await getTheme(session.shop);
  const fontOptions = Object.entries(FONT_FAMILIES).map(([key, f]) => ({ key, label: f.label }));
  return { theme, fontOptions };
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
  const { theme, fontOptions } = loaderData;
  const shopify = useAppBridge();
  const [values, setValues] = useState({
    backgroundColor: theme.backgroundColor,
    textColor: theme.textColor,
    accentColor: theme.accentColor,
    mutedColor: theme.mutedColor,
    lineColor: theme.lineColor,
    fontFamily: theme.fontFamily,
    tagline: theme.tagline,
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

  const fontLabel = fontOptions.find((f) => f.key === values.fontFamily)?.label || values.fontFamily;

  return (
    <s-page heading="Personnalisation du catalogue">
      <s-section heading="Couleurs">
        <s-paragraph>
          Ces couleurs sont utilisées sur toutes les pages du catalogue (couverture, fiches produit,
          séparateurs de catégorie). Les valeurs actuelles correspondent à l&apos;identité Homa Home.
        </s-paragraph>
        <form onSubmit={handleSubmit}>
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
