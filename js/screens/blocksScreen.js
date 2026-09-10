import { el, clear, openModal } from "../dom.js";
import { repository } from "../repository.js";
import { navigate } from "../router.js";
import { pickExercise } from "../exercisePicker.js";
import { LOCATIONS } from "../constants.js";

function chooseBlockType() {
  return new Promise((resolve) => {
    let close;
    const sheet = el("div", { class: "picker" }, [
      el("div", { class: "picker-header" }, [el("h2", { class: "modal-title", text: "Add block" })]),
      el("button", {
        class: "picker-row",
        text: "Single exercise",
        onclick: () => {
          close();
          resolve("single");
        },
      }),
      el("button", {
        class: "picker-row",
        text: "Alternating pair",
        onclick: () => {
          close();
          resolve("alternatingPair");
        },
      }),
      el("button", {
        class: "picker-row",
        text: "Superset (no rest between the two)",
        onclick: () => {
          close();
          resolve("superset");
        },
      }),
      el("button", { class: "picker-close", text: "Cancel", onclick: () => { close(); resolve(null); } }),
    ]);
    close = openModal(sheet);
  });
}

function chooseSourceLocation(options) {
  return new Promise((resolve) => {
    let close;
    const sheet = el("div", { class: "picker" }, [
      el("div", { class: "picker-header" }, [el("h2", { class: "modal-title", text: "Copy from…" })]),
      ...options.map((loc) =>
        el("button", {
          class: "picker-row",
          text: loc,
          onclick: () => {
            close();
            resolve(loc);
          },
        })
      ),
      el("button", { class: "picker-close", text: "Cancel", onclick: () => { close(); resolve(null); } }),
    ]);
    close = openModal(sheet);
  });
}

export async function renderBlocksScreen(root, routineId, location) {
  clear(root);

  const routine = await repository.getRoutine(routineId);
  if (!routine) {
    root.appendChild(el("p", { text: "Routine not found." }));
    return;
  }

  const exercises = await repository.listExercises({ includeArchived: true });
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  root.appendChild(
    el("div", { class: "screen-header" }, [
      el("h1", { text: `${routine.name} — ${location}` }),
      el("button", {
        text: "+",
        onclick: async () => {
          const type = await chooseBlockType();
          if (!type) return;
          const exercise1 = await pickExercise();
          if (!exercise1) return;
          let exercise2 = null;
          if (type === "alternatingPair" || type === "superset") {
            exercise2 = await pickExercise();
            if (!exercise2) return;
          }
          const blocks = await repository.listBlocksForRoutine(routineId, location);
          await repository.createRoutineBlock({
            routineId,
            location,
            orderIndex: blocks.length,
            blockType: type,
            exercise1Id: exercise1.id,
            exercise2Id: exercise2 ? exercise2.id : null,
            hasWarmup1: false,
            hasWarmup2: false,
          });
          await renderBlocksScreen(root, routineId, location);
        },
      }),
    ])
  );

  const blocks = await repository.listBlocksForRoutine(routineId, location);

  // "Copy from another location" only appears when THIS location is
  // blank, and only offers locations that actually have something to
  // copy — the frame flipped from "push structure out" to "pull a
  // starting point in" (user feedback).
  if (blocks.length === 0) {
    const sourcesWithBlocks = [];
    for (const loc of LOCATIONS.filter((l) => l !== location)) {
      const theirBlocks = await repository.listBlocksForRoutine(routineId, loc);
      if (theirBlocks.length > 0) sourcesWithBlocks.push(loc);
    }
    if (sourcesWithBlocks.length > 0) {
      root.appendChild(
        el("button", {
          class: "secondary-action",
          text: "Copy from another location",
          onclick: async () => {
            const source = await chooseSourceLocation(sourcesWithBlocks);
            if (!source) return;
            await repository.duplicateRoutineToLocation(routineId, source, location);
            await renderBlocksScreen(root, routineId, location);
          },
        })
      );
    }
  }

  const list = el("div", { class: "list" });

  if (blocks.length === 0) {
    list.appendChild(el("p", { class: "muted", text: "No blocks yet for this location. Tap + to add one." }));
  }

  blocks.forEach((block, index) => {
    list.appendChild(renderBlockRow(root, routineId, location, block, blocks, index, exerciseById));
  });

  root.appendChild(list);
}

function renderBlockRow(root, routineId, location, block, blocks, index, exerciseById) {
  const names = [block.exercise1Id, block.exercise2Id]
    .filter(Boolean)
    .map((id) => exerciseById.get(id)?.name ?? "?")
    .join(" / ");

  const card = el("div", { class: "card" });
  card.appendChild(
    el("div", { class: "row-card" }, [
      el(
        "button",
        {
          class: "row-main",
          onclick: () => navigate(`/routines/${routineId}/${location}/blocks/${block.id}`),
        },
        [el("span", { class: "badge", text: block.blockType }), el("strong", { text: names })]
      ),
      el("div", { class: "row-actions" }, [
        el("button", {
          class: "icon-button",
          text: "↑",
          disabled: index === 0 ? "disabled" : null,
          onclick: async () => {
            const ordered = blocks.map((b) => b.id);
            [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]];
            await repository.reorderBlocks(ordered);
            await renderBlocksScreen(root, routineId, location);
          },
        }),
        el("button", {
          class: "icon-button",
          text: "↓",
          disabled: index === blocks.length - 1 ? "disabled" : null,
          onclick: async () => {
            const ordered = blocks.map((b) => b.id);
            [ordered[index + 1], ordered[index]] = [ordered[index], ordered[index + 1]];
            await repository.reorderBlocks(ordered);
            await renderBlocksScreen(root, routineId, location);
          },
        }),
        el("button", {
          class: "danger-link",
          text: "Remove",
          onclick: async () => {
            // No confirmation by design — SPEC.md §6: removing a block
            // is frictionless and only affects this (routine, location).
            await repository.deleteRoutineBlock(block.id);
            await renderBlocksScreen(root, routineId, location);
          },
        }),
      ]),
    ])
  );

  // Expand-in-place set/weight preview (user feedback) — reps aren't
  // shown here, they're only meaningful for the progression rules, not
  // for glancing at what a block is currently loaded at.
  const preview = el("div", { class: "block-preview" });
  preview.hidden = true;
  const toggle = el("button", { class: "link-button", text: "Preview weights ▸" });
  toggle.addEventListener("click", async () => {
    if (preview.hidden) {
      if (!preview.dataset.loaded) {
        await renderPreviewContents(preview, block, exerciseById);
        preview.dataset.loaded = "true";
      }
      preview.hidden = false;
      toggle.textContent = "Hide weights ▾";
    } else {
      preview.hidden = true;
      toggle.textContent = "Preview weights ▸";
    }
  });
  card.appendChild(toggle);
  card.appendChild(preview);

  return card;
}

async function renderPreviewContents(preview, block, exerciseById) {
  for (const exerciseId of [block.exercise1Id, block.exercise2Id].filter(Boolean)) {
    const exercise = exerciseById.get(exerciseId);
    const targets = await repository.listSetTargetsForExercise(exerciseId, block.location);
    const weights = targets
      .sort((a, b) => a.setNumber - b.setNumber)
      .map((t) => (t.currentWeight < 0 ? `${Math.abs(t.currentWeight)} assist` : `${t.currentWeight}`))
      .join(", ");
    preview.appendChild(
      el("p", { class: "muted", text: `${exercise?.name ?? "Exercise"}: ${weights || "no sets yet"}` })
    );
  }
}
