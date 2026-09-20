import { el, clear, labeledField } from "../dom.js";
import { repository } from "../repository.js";
import { pickExercise } from "../exercisePicker.js";
import { EQUIPMENT_CATEGORIES, categoryLabel } from "../constants.js";

export async function renderExercisesScreen(root) {
  clear(root);

  root.appendChild(
    el("div", { class: "screen-header" }, [
      el("h1", { text: "Exercises" }),
      el("button", {
        text: "+ Add",
        onclick: async () => {
          const chosen = await pickExercise();
          if (chosen) await renderExercisesScreen(root);
        },
      }),
    ])
  );

  const exercises = await repository.listExercises();
  const list = el("div", { class: "list" });

  if (exercises.length === 0) {
    list.appendChild(
      el("p", { class: "muted", text: "No exercises yet. Tap Add to search the library or create one." })
    );
  }

  for (const exercise of exercises) {
    list.appendChild(renderExerciseRow(exercise, () => renderExercisesScreen(root)));
  }

  root.appendChild(list);
}

function renderExerciseRow(exercise, onChange) {
  const nameInput = el("input", { type: "text", value: exercise.name, class: "inline-input" });
  const categorySelect = el(
    "select",
    { class: "inline-select" },
    EQUIPMENT_CATEGORIES.map((c) =>
      el("option", { value: c, text: categoryLabel(c), ...(c === exercise.equipmentCategory ? { selected: "selected" } : {}) })
    )
  );
  const incrementInput = el("input", {
    type: "number",
    value: exercise.defaultIncrement,
    class: "inline-input inline-input-narrow",
    step: "0.5",
  });

  // Plate-loaded machines only: the empty machine's own weight (carriage
  // or sled), so the plate diagram can subtract it — see
  // activeWorkoutScreen.js's plate calculator. 0 = weight is plates only.
  const startWeightInput =
    exercise.equipmentCategory === "plateLoaded"
      ? el("input", {
          type: "number",
          value: exercise.startWeight ?? 0,
          class: "inline-input inline-input-narrow",
          step: "0.5",
        })
      : null;

  async function save() {
    await repository.updateExercise(exercise.id, {
      name: nameInput.value.trim() || exercise.name,
      equipmentCategory: categorySelect.value,
      defaultIncrement: parseFloat(incrementInput.value) || 0,
      ...(startWeightInput ? { startWeight: parseFloat(startWeightInput.value) || 0 } : {}),
    });
  }

  nameInput.addEventListener("change", save);
  // Re-render after a category change so the start-weight field appears
  // or disappears with it.
  categorySelect.addEventListener("change", async () => {
    await save();
    onChange();
  });
  incrementInput.addEventListener("change", save);
  startWeightInput?.addEventListener("change", save);

  return el("div", { class: "card row-card" }, [
    el("div", { class: "row-fields" }, [
      labeledField("Name", nameInput),
      labeledField("Equipment", categorySelect),
      labeledField("Increment (lb)", incrementInput),
      ...(startWeightInput ? [labeledField("Empty machine (lb)", startWeightInput)] : []),
    ]),
    el("button", {
      class: "danger-link",
      text: "Archive",
      onclick: async () => {
        await repository.archiveExercise(exercise.id);
        onChange();
      },
    }),
  ]);
}
