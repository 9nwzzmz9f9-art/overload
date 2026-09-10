import { el, clear, labeledField } from "../dom.js";
import { repository } from "../repository.js";
import { navigate } from "../router.js";

export async function renderBlockDetailScreen(root, routineId, location, blockId) {
  clear(root);

  const block = await repository.getRoutineBlock(blockId);
  if (!block) {
    root.appendChild(el("p", { text: "Block not found." }));
    return;
  }

  root.appendChild(
    el("div", { class: "screen-header" }, [
      el("button", {
        class: "back-link",
        text: "← Back",
        onclick: () => navigate(`/routines/${routineId}/${location}/blocks`),
      }),
    ])
  );
  root.appendChild(el("h1", { text: "Edit block" }));

  const slots = [
    { exerciseId: block.exercise1Id, hasWarmupKey: "hasWarmup1", hasWarmup: block.hasWarmup1 },
  ];
  if (block.exercise2Id) {
    slots.push({ exerciseId: block.exercise2Id, hasWarmupKey: "hasWarmup2", hasWarmup: block.hasWarmup2 });
  }

  for (const slot of slots) {
    root.appendChild(await renderExerciseSlot(block, slot, routineId, location, blockId, root));
  }
}

async function renderExerciseSlot(block, slot, routineId, location, blockId, root) {
  const exercise = await repository.getExercise(slot.exerciseId);
  const section = el("section", { class: "card" });

  const warmupCheckbox = el("input", {
    type: "checkbox",
    id: `warmup-${slot.exerciseId}`,
    ...(slot.hasWarmup ? { checked: "checked" } : {}),
  });
  warmupCheckbox.addEventListener("change", async () => {
    await repository.updateRoutineBlock(blockId, { [slot.hasWarmupKey]: warmupCheckbox.checked });
  });

  section.appendChild(el("h3", { text: exercise?.name ?? "Unknown exercise" }));
  section.appendChild(
    el("label", { class: "checkbox-label" }, [
      warmupCheckbox,
      el("span", { text: " Warmup before working sets" }),
    ])
  );

  const setsList = el("div", { class: "set-list" });
  const targets = await repository.listSetTargetsForExercise(slot.exerciseId, location);

  targets.forEach((target) => {
    setsList.appendChild(renderSetRow(target, routineId, location, blockId, root));
  });

  section.appendChild(setsList);

  section.appendChild(
    el("button", {
      class: "secondary-action",
      text: "+ Add set",
      onclick: async () => {
        const settings = await repository.getAppSettings();
        const nextSetNumber = targets.length + 1;
        await repository.createSetTarget({
          exerciseId: slot.exerciseId,
          location,
          setNumber: nextSetNumber,
          currentWeight: 0,
          repRangeLow: 4,
          repRangeHigh: 6, // progressionTriggerReps is derived from this — see repository.createSetTarget
          increment: exercise?.defaultIncrement ?? 5,
          restSeconds: settings.defaultRestSeconds,
        });
        await renderBlockDetailScreen(root, routineId, location, blockId);
      },
    })
  );

  return section;
}

function renderSetRow(target, routineId, location, blockId, root) {
  // No separate "Trigger" field — progressionTriggerReps always mirrors
  // repRangeHigh now (user feedback), enforced in repository.updateSetTarget.
  // Editing "Range high" IS editing the progression trigger.
  const fields = {
    currentWeight: numberInput(target.currentWeight, 0.5),
    repRangeLow: numberInput(target.repRangeLow, 1),
    repRangeHigh: numberInput(target.repRangeHigh, 1),
    increment: numberInput(target.increment, 0.5),
    restSeconds: numberInput(target.restSeconds, 5),
  };

  async function save() {
    await repository.updateSetTarget(target.id, {
      currentWeight: parseFloat(fields.currentWeight.value),
      repRangeLow: parseInt(fields.repRangeLow.value, 10),
      repRangeHigh: parseInt(fields.repRangeHigh.value, 10),
      increment: parseFloat(fields.increment.value),
      restSeconds: parseInt(fields.restSeconds.value, 10),
    });
  }
  Object.values(fields).forEach((input) => input.addEventListener("change", save));

  return el("div", { class: "set-row" }, [
    el("span", { class: "set-label", text: `Set ${target.setNumber}` }),
    labeledField("Weight", fields.currentWeight),
    labeledField("Range low", fields.repRangeLow),
    labeledField("Range high (= trigger)", fields.repRangeHigh),
    labeledField("Increment", fields.increment),
    labeledField("Rest (s)", fields.restSeconds),
    el("button", {
      class: "danger-link",
      text: "Remove set",
      onclick: async () => {
        await repository.deleteSetTarget(target.id);
        await renderBlockDetailScreen(root, routineId, location, blockId);
      },
    }),
  ]);
}

function numberInput(value, step) {
  return el("input", { type: "number", value, step, class: "inline-input inline-input-narrow" });
}
