import { el, openModal, clear } from "./dom.js";
import { repository } from "./repository.js";
import { exerciseLibrary } from "./exerciseLibrary.js";
import { EQUIPMENT_CATEGORIES } from "./constants.js";

// Shared search/browse sheet for both pickExercise() (creates or links a
// real exercise record) and pickExerciseName() (just resolves with a name
// string — e.g. logging a substitution mid-workout — and never touches
// the exercises store). Filters by equipment category and, for library
// results, primary muscle group (SPEC.md §6.2's picker spec, now with a
// muscle filter added per user feedback).
function openSearchSheet({ title, createLabel, onPickMine, onPickLibrary, onUseText }) {
  return new Promise((resolve) => {
    let resolved = false;
    let close;

    function finish(result) {
      if (resolved) return;
      resolved = true;
      close();
      resolve(result);
    }

    const searchInput = el("input", {
      type: "text",
      placeholder: "Search exercises…",
      class: "picker-search",
    });
    const categorySelect = el("select", { class: "picker-filter" }, [
      el("option", { value: "", text: "Any equipment" }),
      ...EQUIPMENT_CATEGORIES.map((c) => el("option", { value: c, text: c })),
    ]);
    const muscleSelect = el("select", { class: "picker-filter" }, [
      el("option", { value: "", text: "Any muscle" }),
    ]);
    exerciseLibrary.allMuscles().then((muscles) => {
      for (const m of muscles) muscleSelect.appendChild(el("option", { value: m, text: m }));
    });

    const resultsList = el("div", { class: "picker-results" });
    // Minimized by default (user feedback) — "My exercises" tends to be
    // the longest list and isn't what most picker visits are for.
    // Typing a search query auto-expands it, since at that point you're
    // actively looking for something that might be in either section.
    let myExercisesExpanded = false;

    async function renderResults() {
      clear(resultsList);
      const query = searchInput.value;
      const category = categorySelect.value || null;
      const muscle = muscleSelect.value || null;

      // "My exercises" have no muscle-group data of their own — the
      // muscle filter only narrows the library section below.
      const mine = await repository.listExercises();
      const matchingMine = mine.filter(
        (e) =>
          (!query || e.name.toLowerCase().includes(query.toLowerCase())) &&
          (!category || e.equipmentCategory === category)
      );

      if (matchingMine.length > 0) {
        const expanded = myExercisesExpanded || query.trim().length > 0;
        resultsList.appendChild(
          el("h3", {
            class: "picker-section",
            text: expanded ? "My exercises" : `My exercises (${matchingMine.length})`,
          })
        );
        if (!expanded) {
          resultsList.appendChild(
            el("button", {
              class: "picker-row picker-expand",
              text: "Show my exercises ▸",
              onclick: () => {
                myExercisesExpanded = true;
                renderResults();
              },
            })
          );
        } else {
          matchingMine.forEach((exercise) => {
            resultsList.appendChild(
              el("button", { class: "picker-row", onclick: () => onPickMine(exercise, finish) }, [
                el("span", { text: exercise.name }),
              ])
            );
          });
        }
      }

      const libraryMatches = await exerciseLibrary.search(query, { equipmentCategory: category, muscle });
      if (libraryMatches.length > 0) {
        resultsList.appendChild(el("h3", { class: "picker-section", text: "Library" }));
        libraryMatches.slice(0, 40).forEach((entry) => {
          resultsList.appendChild(
            el("button", { class: "picker-row", onclick: () => onPickLibrary(entry, finish) }, [
              el("span", { text: entry.name }),
              el("span", { class: "muted", text: entry.equipment }),
            ])
          );
        });
      }

      if (query.trim()) {
        resultsList.appendChild(
          el(
            "button",
            {
              class: "picker-row picker-create",
              onclick: () => onUseText(query.trim(), finish, { category }),
            },
            [el("span", { text: `${createLabel} "${query.trim()}"` })]
          )
        );
      }
    }

    searchInput.addEventListener("input", renderResults);
    categorySelect.addEventListener("change", renderResults);
    muscleSelect.addEventListener("change", renderResults);

    const sheet = el("div", { class: "picker" }, [
      el("div", { class: "picker-header" }, [
        el("h2", { class: "modal-title", text: title }),
        el("button", { class: "picker-close", text: "Cancel", onclick: () => finish(null) }),
      ]),
      el("div", { class: "picker-filters" }, [searchInput, categorySelect, muscleSelect]),
      resultsList,
    ]);

    close = openModal(sheet);
    renderResults();
    searchInput.focus();
  });
}

/**
 * Opens the searchable exercise picker sheet (SPEC.md §6.2).
 * Resolves with the chosen/created Exercise record, or null if
 * dismissed without a choice.
 * @returns {Promise<object|null>}
 */
export function pickExercise() {
  return openSearchSheet({
    title: "Choose exercise",
    createLabel: "Create custom",
    onPickMine: (exercise, finish) => finish(exercise),
    onPickLibrary: async (entry, finish) => {
      const created = await repository.createExercise({
        name: entry.name,
        equipmentCategory: entry.equipmentCategory,
        defaultIncrement: entry.defaultIncrement,
      });
      finish(created);
    },
    onUseText: async (text, finish, { category }) => {
      const created = await repository.createExercise({
        name: text,
        equipmentCategory: category || "machine",
        defaultIncrement: 5,
      });
      finish(created);
    },
  });
}

/**
 * The same search/browse sheet, but for logging a substitution
 * (SPEC.md §5 "Substitutions") — resolves with a plain name string and
 * never creates or links a real exercise record, or null if dismissed.
 * @returns {Promise<string|null>}
 */
export function pickExerciseName() {
  return openSearchSheet({
    title: "Substituted with…",
    createLabel: "Use",
    onPickMine: (exercise, finish) => finish(exercise.name),
    onPickLibrary: (entry, finish) => finish(entry.name),
    onUseText: (text, finish) => finish(text),
  });
}
