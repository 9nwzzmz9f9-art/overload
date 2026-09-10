// Programs (user feedback — not in the original spec): an ordered
// grouping of existing routines, e.g. "Winter Bulk" containing
// Upper/Lower/Push/Pull. Purely additive on top of routines/blocks/set
// targets — a program owns membership + order only, never the routine
// records themselves. See repository.js's "programs" section and
// getNextRoutineInRotation for how the active program steers Home.

import { el, clear } from "../dom.js";
import { repository } from "../repository.js";

export async function renderProgramsScreen(root) {
  clear(root);

  root.appendChild(
    el("div", { class: "screen-header" }, [
      el("h1", { text: "Programs" }),
      el("button", {
        text: "+ Add",
        onclick: async () => {
          const name = prompt("Program name (e.g. Winter Bulk)");
          if (!name) return;
          await repository.createProgram({ name });
          await renderProgramsScreen(root);
        },
      }),
    ])
  );
  root.appendChild(
    el("p", {
      class: "muted",
      text: "Group routines into an overarching program and pick which one drives the rotation on Home.",
    })
  );

  const [programs, routines, settings] = await Promise.all([
    repository.listPrograms(),
    repository.listRoutines(),
    repository.getAppSettings(),
  ]);
  const routineById = new Map(routines.map((r) => [r.id, r]));

  if (programs.length === 0) {
    root.appendChild(el("p", { class: "muted", text: "No programs yet. Tap Add to create one." }));
    return;
  }

  const list = el("div", { class: "list" });
  for (const program of programs) {
    list.appendChild(renderProgramCard(root, program, routines, routineById, settings.activeProgramId));
  }
  root.appendChild(list);
}

function renderProgramCard(root, program, allRoutines, routineById, activeProgramId) {
  const isActive = program.id === activeProgramId;
  const card = el("div", { class: "card" });

  card.appendChild(
    el("div", { class: "row-card" }, [
      el("div", {}, [
        el("strong", { text: program.name }),
        isActive ? el("span", { class: "badge", text: "Active" }) : null,
      ]),
      el("div", { class: "row-actions" }, [
        isActive
          ? null
          : el("button", {
              class: "icon-button",
              text: "Set active",
              onclick: async () => {
                await repository.setActiveProgram(program.id);
                await renderProgramsScreen(root);
              },
            }),
        el("button", {
          class: "danger-link",
          text: "Delete",
          onclick: async () => {
            if (!confirm(`Delete "${program.name}"? Its routines aren't deleted — only the grouping.`)) {
              return;
            }
            await repository.deleteProgram(program.id);
            await renderProgramsScreen(root);
          },
        }),
      ]),
    ])
  );

  const routineList = el("div", { class: "list" });
  program.routineIds.forEach((routineId, index) => {
    const routine = routineById.get(routineId);
    if (!routine) return; // stale reference — routine was deleted elsewhere
    routineList.appendChild(
      el("div", { class: "row-card" }, [
        el("span", { text: routine.name }),
        el("div", { class: "row-actions" }, [
          el("button", {
            class: "icon-button",
            text: "↑",
            disabled: index === 0 ? "disabled" : null,
            onclick: async () => {
              const ordered = [...program.routineIds];
              [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]];
              await repository.reorderProgramRoutines(program.id, ordered);
              await renderProgramsScreen(root);
            },
          }),
          el("button", {
            class: "icon-button",
            text: "↓",
            disabled: index === program.routineIds.length - 1 ? "disabled" : null,
            onclick: async () => {
              const ordered = [...program.routineIds];
              [ordered[index + 1], ordered[index]] = [ordered[index], ordered[index + 1]];
              await repository.reorderProgramRoutines(program.id, ordered);
              await renderProgramsScreen(root);
            },
          }),
          el("button", {
            class: "danger-link",
            text: "Remove",
            onclick: async () => {
              await repository.removeRoutineFromProgram(program.id, routineId);
              await renderProgramsScreen(root);
            },
          }),
        ]),
      ])
    );
  });
  card.appendChild(routineList);

  const available = allRoutines.filter((r) => !program.routineIds.includes(r.id));
  if (available.length > 0) {
    const select = el(
      "select",
      { class: "inline-select" },
      available.map((r) => el("option", { value: r.id, text: r.name }))
    );
    const addBtn = el("button", {
      class: "secondary-action",
      text: "+ Add routine",
      onclick: async () => {
        await repository.addRoutineToProgram(program.id, select.value);
        await renderProgramsScreen(root);
      },
    });
    card.appendChild(el("div", { class: "row-fields" }, [select, addBtn]));
  } else if (allRoutines.length === 0) {
    card.appendChild(
      el("p", { class: "muted", text: "No routines exist yet — create one in Routines first." })
    );
  }

  return card;
}
