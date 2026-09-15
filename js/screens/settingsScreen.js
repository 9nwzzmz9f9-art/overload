// Settings (user feedback: "where are the maximums set?" — they weren't,
// anywhere in the UI). Two sections: the app-level default rest, and the
// per-location plate profiles that drive the plate calculator (§6) and
// the equipment ceilings the progression engine checks (§5).

import { el, clear, labeledField } from "../dom.js";
import { repository } from "../repository.js";
import { LOCATIONS } from "../constants.js";
import { buildJsonExport, buildLoggedSetsCsv } from "../dataExporter.js";
import { parseImport, describeCounts, importReplacingAll } from "../dataImporter.js";
import { getLocationLabels, labelFor } from "../locationLabels.js";

const CEILING_FIELDS = [
  ["barbellCeiling", "Barbell"],
  ["dumbbellCeiling", "Dumbbell"],
  ["machineCeiling", "Machine"],
  ["cableCeiling", "Cable"],
];

const DEFAULT_PLATE_DENOMINATIONS = [
  { weight: 45, count: 2 },
  { weight: 35, count: 2 },
  { weight: 25, count: 2 },
  { weight: 10, count: 2 },
  { weight: 5, count: 2 },
  { weight: 2.5, count: 2 },
];

export async function renderSettingsScreen(root, location = LOCATIONS[0]) {
  clear(root);
  root.appendChild(el("h1", { text: "Settings" }));

  await renderDefaults(root);
  await renderLocationNames(root);
  await renderPlateProfiles(root, location);
  renderExport(root);
}

// User feedback: "add an option to customize the names of the workout
// locations." Display-only — see locationLabels.js.
async function renderLocationNames(root) {
  const settings = await repository.getAppSettings();
  const names = { ...settings.locationNames };

  const inputs = LOCATIONS.map((id) => {
    const input = el("input", { type: "text", value: names[id] ?? id, class: "inline-input" });
    input.addEventListener("change", async () => {
      const value = input.value.trim();
      if (!value) {
        input.value = names[id] ?? id; // reject blank — reset to what's saved
        return;
      }
      names[id] = value;
      await repository.updateAppSettings({ locationNames: { ...names } });
    });
    return [id, input];
  });

  root.appendChild(
    el(
      "section",
      { class: "card" },
      [
        el("h2", { text: "Location names" }),
        el("p", { class: "muted", text: "Shown throughout the app — doesn't change any of your logged data." }),
        ...inputs.map(([id, input]) => labeledField(`"${id}" is called`, input)),
      ]
    )
  );
}

// SPEC.md §7.3. All data lives only in this device's IndexedDB — this is
// the only backup. JSON is the full, restorable dump; CSV is a flat set
// log for spreadsheets.
function renderExport(root) {
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const today = new Date().toISOString().slice(0, 10);

  root.appendChild(
    el("section", { class: "card" }, [
      el("h2", { text: "Backup" }),
      el("p", {
        class: "muted",
        text: "Nothing syncs anywhere — export regularly, especially before clearing browser data or updating iOS.",
      }),
      el("button", {
        class: "secondary-action",
        text: "Export all data (JSON)",
        onclick: async () => {
          download(`overload-export-${today}.json`, await buildJsonExport(), "application/json");
        },
      }),
      el("button", {
        class: "secondary-action",
        text: "Export set log (CSV)",
        onclick: async () => {
          download(`overload-sets-${today}.csv`, await buildLoggedSetsCsv(), "text/csv");
        },
      }),
      renderImportControl(),
    ])
  );
}

// Restore from a JSON export — replaces the whole database, so it's
// guarded by a confirm() that names what's coming in.
function renderImportControl() {
  const fileInput = el("input", { type: "file", accept: "application/json,.json" });
  fileInput.hidden = true;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = ""; // so re-picking the same file still fires change
    if (!file) return;
    try {
      const text = await file.text();
      const { counts } = parseImport(text);
      if (
        !confirm(
          `Replace ALL current data with this backup?\n\nIt contains: ${describeCounts(counts)}.\n\nThis cannot be undone.`
        )
      ) {
        return;
      }
      await importReplacingAll(text);
      alert("Restore complete. Reloading.");
      location.reload();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  });

  const wrapper = el("div", {}, [
    el("button", {
      class: "secondary-action",
      text: "Import / restore from backup",
      onclick: () => fileInput.click(),
    }),
    fileInput,
  ]);
  return wrapper;
}

async function renderDefaults(root) {
  const settings = await repository.getAppSettings();

  const restInput = el("input", {
    type: "number",
    step: "5",
    value: settings.defaultRestSeconds,
    class: "inline-input inline-input-narrow",
  });
  restInput.addEventListener("change", async () => {
    const parsed = parseInt(restInput.value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      await repository.updateAppSettings({ defaultRestSeconds: parsed });
    }
  });

  root.appendChild(
    el("section", { class: "card" }, [
      el("h2", { text: "Defaults" }),
      labeledField("Default rest (seconds)", restInput),
      el("p", {
        class: "muted",
        text: "Applies to newly created sets only — existing sets keep their own rest value.",
      }),
    ])
  );
}

async function renderPlateProfiles(root, location) {
  const section = el("section");
  section.appendChild(el("h2", { text: "Plate profiles" }));

  const labels = await getLocationLabels();
  const tabs = el(
    "div",
    { class: "tabs" },
    LOCATIONS.map((loc) =>
      el("button", {
        class: loc === location ? "tab tab-active" : "tab",
        text: labelFor(labels, loc),
        onclick: () => renderSettingsScreen(root, loc),
      })
    )
  );
  section.appendChild(tabs);

  const profile = await repository.getPlateProfileForLocation(location);
  const card = el("section", { class: "card" });

  if (!profile) {
    card.appendChild(
      el("p", { class: "muted", text: `No plate profile for ${labelFor(labels, location)} yet.` })
    );
    card.appendChild(
      el("button", {
        class: "secondary-action",
        text: "Create plate profile",
        onclick: async () => {
          await repository.createPlateProfile({
            location,
            barWeight: 45,
            plateDenominations: DEFAULT_PLATE_DENOMINATIONS.map((d) => ({ ...d })),
            barbellCeiling: null,
            dumbbellCeiling: null,
            machineCeiling: null,
            cableCeiling: null,
          });
          renderSettingsScreen(root, location);
        },
      })
    );
    section.appendChild(card);
    root.appendChild(section);
    return;
  }

  // The whole profile is saved on every change — reconstructed from the
  // live field values each time, so add/remove of a plate row and edits
  // to bar weight / ceilings all go through one path.
  const barInput = el("input", {
    type: "number",
    step: "0.5",
    value: profile.barWeight,
    class: "inline-input inline-input-narrow",
  });

  const denomList = el("div", { class: "denom-list" });
  let denominations = (profile.plateDenominations ?? []).map((d) => ({ ...d }));

  const ceilingInputs = {};
  for (const [field] of CEILING_FIELDS) {
    ceilingInputs[field] = el("input", {
      type: "number",
      step: "0.5",
      value: profile[field] ?? "",
      class: "inline-input inline-input-narrow",
    });
  }

  async function save() {
    const changes = {
      barWeight: parseFloat(barInput.value) || profile.barWeight,
      plateDenominations: denominations
        .map((d) => ({ weight: parseFloat(d.weightInput.value), count: parseInt(d.countInput.value, 10) }))
        .filter((d) => Number.isFinite(d.weight) && Number.isFinite(d.count) && d.weight > 0),
    };
    for (const [field] of CEILING_FIELDS) {
      const raw = ceilingInputs[field].value.trim();
      changes[field] = raw === "" ? null : parseFloat(raw);
      if (Number.isNaN(changes[field])) changes[field] = null;
    }
    await repository.updatePlateProfile(profile.id, changes);
  }

  function renderDenominations() {
    clear(denomList);
    denominations.forEach((d, index) => {
      d.weightInput = el("input", {
        type: "number",
        step: "0.5",
        value: d.weight,
        class: "inline-input inline-input-narrow",
      });
      d.countInput = el("input", {
        type: "number",
        step: "1",
        value: d.count,
        class: "inline-input inline-input-narrow",
      });
      d.weightInput.addEventListener("change", save);
      d.countInput.addEventListener("change", save);
      denomList.appendChild(
        el("div", { class: "denom-row" }, [
          d.weightInput,
          el("span", { class: "muted", text: "×" }),
          d.countInput,
          el("button", {
            class: "danger-link",
            text: "Remove",
            onclick: async () => {
              denominations.splice(index, 1);
              renderDenominations();
              await save();
            },
          }),
        ])
      );
    });
    denomList.appendChild(
      el("button", {
        class: "secondary-action",
        text: "+ Add plate",
        onclick: async () => {
          denominations.push({ weight: 5, count: 2 });
          renderDenominations();
          await save();
        },
      })
    );
  }

  barInput.addEventListener("change", save);
  for (const [field] of CEILING_FIELDS) ceilingInputs[field].addEventListener("change", save);

  card.appendChild(labeledField("Bar weight (lb)", barInput));
  card.appendChild(el("h3", { text: "Plates on hand" }));
  card.appendChild(
    el("p", { class: "muted", text: "Count is the total you own — the calculator halves it per side." })
  );
  renderDenominations();
  card.appendChild(denomList);

  card.appendChild(el("h3", { text: "Equipment ceilings" }));
  card.appendChild(
    el("p", {
      class: "muted",
      text: "Blank = no ceiling. Progression won't push a set past this weight for that category.",
    })
  );
  for (const [field, labelText] of CEILING_FIELDS) {
    card.appendChild(labeledField(labelText, ceilingInputs[field]));
  }

  section.appendChild(card);
  root.appendChild(section);
}
