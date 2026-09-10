import { el, clear } from "../dom.js";
import { repository } from "../repository.js";
import { navigate } from "../router.js";
import { LOCATIONS } from "../constants.js";

export async function renderRoutinesScreen(root, location) {
  clear(root);

  const locationTabs = el(
    "div",
    { class: "tabs" },
    LOCATIONS.map((loc) =>
      el("button", {
        class: loc === location ? "tab tab-active" : "tab",
        text: loc,
        onclick: () => navigate(`/routines/${loc}`),
      })
    )
  );

  root.appendChild(
    el("div", { class: "screen-header" }, [
      el("h1", { text: "Routines" }),
      el("button", {
        text: "+ Add",
        onclick: async () => {
          const name = prompt("Routine name (e.g. Upper, Lower, Push, Pull)");
          if (!name) return;
          const routines = await repository.listRoutines();
          await repository.createRoutine({ name, rotationIndex: routines.length });
          await renderRoutinesScreen(root, location);
        },
      }),
    ])
  );
  root.appendChild(locationTabs);
  root.appendChild(
    el("p", { class: "muted", text: `Editing structure for: ${location}. Rotation order applies to all locations.` })
  );

  const routines = await repository.listRoutines();
  const list = el("div", { class: "list" });

  routines.forEach((routine, index) => {
    const row = el("div", { class: "card row-card" }, [
      el(
        "button",
        {
          class: "row-main",
          onclick: () => navigate(`/routines/${routine.id}/${location}/blocks`),
        },
        [
          el("strong", { text: routine.name }),
          el("span", { class: "muted", text: ` (rotation ${routine.rotationIndex})` }),
        ]
      ),
      el("div", { class: "row-actions" }, [
        el("button", {
          class: "icon-button",
          text: "↑",
          disabled: index === 0 ? "disabled" : null,
          onclick: async () => {
            const ordered = routines.map((r) => r.id);
            [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]];
            await repository.reorderRoutines(ordered);
            await renderRoutinesScreen(root, location);
          },
        }),
        el("button", {
          class: "icon-button",
          text: "↓",
          disabled: index === routines.length - 1 ? "disabled" : null,
          onclick: async () => {
            const ordered = routines.map((r) => r.id);
            [ordered[index + 1], ordered[index]] = [ordered[index], ordered[index + 1]];
            await repository.reorderRoutines(ordered);
            await renderRoutinesScreen(root, location);
          },
        }),
        el("button", {
          class: "danger-link",
          text: "Delete",
          onclick: async () => {
            if (!confirm(`Delete "${routine.name}"? This removes it from every location.`)) return;
            await repository.deleteRoutine(routine.id);
            await renderRoutinesScreen(root, location);
          },
        }),
      ]),
    ]);
    list.appendChild(row);
  });

  if (routines.length === 0) {
    list.appendChild(el("p", { class: "muted", text: "No routines yet. Tap Add to create one." }));
  }

  root.appendChild(list);
}
