import { el, clear, labeledField } from "../dom.js";
import { repository } from "../repository.js";
import { pickExercise } from "../exercisePicker.js";
import { EQUIPMENT_CATEGORIES } from "../constants.js";

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
      el("option", { value: c, text: c, ...(c === exercise.equipmentCategory ? { selected: "selected" } : {}) })
    )
  );
  const incrementInput = el("input", {
    type: "number",
    value: exercise.defaultIncrement,
    class: "inline-input inline-input-narrow",
    step: "0.5",
  });

  async function save() {
    await repository.updateExercise(exercise.id, {
      name: nameInput.value.trim() || exercise.name,
      equipmentCategory: categorySelect.value,
      defaultIncrement: parseFloat(incrementInput.value) || 0,
    });
  }

  nameInput.addEventListener("change", save);
  categorySelect.addEventListener("change", save);
  incrementInput.addEventListener("change", save);

  return el("div", { class: "card row-card" }, [
    el("div", { class: "row-fields" }, [
      labeledField("Name", nameInput),
      labeledField("Equipment", categorySelect),
      labeledField("Increment (lb)", incrementInput),
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
