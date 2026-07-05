import { nanoid } from "nanoid";
import { persistDataUrlAsset, persistRemoteAsset } from "./blob-store";
import { judgeAsset, judgeConfigForStep, judgeFailurePayload } from "./judge";
import { executeLocalMediaStep, prepareExtendFirstFrame } from "./local-media";
import {
  addAssetLedger,
  addFeedbackLedger,
  createRunLedger,
  getRunSnapshot,
  updateRunLedger,
  upsertStepLedger,
  type RunSnapshot,
} from "./run-ledger";
import { loadZapSpec, readPrompt } from "./zap-files";
import { defaultProviderModel, pollGeneration, quoteGeneration, submitGeneration } from "./providers/router";
import { revealZapSecretsForProvider } from "./supabase/server";
import type { GenRequest, ProviderId, ProviderPollResult, ProviderSecrets } from "./provider-types";
import { toZapErrorPayload, ZapRunError } from "./zap-errors";
import type { ZapSpec, ZapStep } from "./zap-schema";

export type RunZapInput = {
  dryRun?: boolean;
  extendCount: number;
  inputs: Record<string, unknown>;
  live?: boolean;
  provider?: ProviderId;
  sessionId?: string;
  slug: string;
  userAccessToken?: string;
  userId?: string;
};

export type RunZapSubmittedStep = {
  actualUsd?: number;
  assetUrl?: string;
  error?: string;
  idemKey?: string;
  kind: ZapStep["kind"];
  model?: string;
  prompt?: string;
  provider?: string;
  providerRequestId?: string;
  quoteUsd: number;
  status: "done" | "planned" | "queued" | "running" | "skipped";
  stepId: string;
};

export type RunZapResponse = {
  dryRun?: boolean;
  message: string;
  quoteUsd: number;
  runId: string;
  status: "planned" | "queued";
  statusUrl: string;
  steps: RunZapSubmittedStep[];
};

export type ZapExecutionTicket = {
  inputs: Record<string, unknown>;
  live?: boolean;
  planned: ZapStep[];
  provider?: ProviderId;
  quoteUsd: number;
  runId: string;
  userAccessToken?: string;
  zap: ZapSpec;
};

export async function runZapRecipe(input: RunZapInput) {
  const ticket = await createZapRunTicket(input);
  if (ticket.execution) startZapRunExecution(ticket.execution);
  return ticket.response;
}

export async function createZapRunTicket({
  dryRun = false,
  extendCount,
  inputs,
  live = false,
  provider,
  sessionId,
  slug,
  userAccessToken,
  userId,
}: RunZapInput): Promise<{ execution?: ZapExecutionTicket; response: RunZapResponse }> {
  const zap = await loadZapSpec(slug);
  if (!zap) {
    throw new ZapRunError({
      code: "UNKNOWN_ZAP",
      message: `Unknown Zap ${slug}.`,
      remediation: "Run list_zaps or open the recipe registry, then retry with a known slug.",
      retryable: false,
    });
  }
  validateInputs(zap, inputs);

  const runId = `run_${nanoid(12)}`;
  const planned = planSteps(zap, extendCount);
  const steps = await describePlannedSteps(zap, runId, planned, inputs, dryRun || !live);
  const quoteUsd = steps.reduce((sum, step) => sum + step.quoteUsd, 0);
  if (quoteUsd > zap.budget.cap_usd) {
    throw new ZapRunError({
      alternatives: ["Reduce extendCount", "Switch final steps to a cheaper model", "Request a higher cap before running"],
      code: "BUDGET_EXCEEDED",
      message: `Run quote $${quoteUsd.toFixed(2)} exceeds recipe cap $${zap.budget.cap_usd}.`,
      remediation: "Reduce the run scope or raise the recipe budget cap before submitting provider work.",
      retryable: false,
    });
  }

  if (dryRun || !live) {
    return {
      response: {
        dryRun: true,
        message: `Planned ${zap.zap} with ${steps.length} steps. No provider work submitted.`,
        quoteUsd,
        runId,
        status: "planned",
        statusUrl: `/runs/${runId}`,
        steps,
      },
    };
  }

  const executionInputs = await normalizeInputAssets(runId, inputs);

  await createRunLedger({
    inputs: executionInputs,
    runId,
    sessionId,
    userId,
    zapSlug: zap.zap,
    zapVersion: zap.version,
  });
  await Promise.all(
    steps.map((step) =>
      upsertStepLedger({
        kind: step.kind,
        model: step.model,
        priceQuoteUsd: step.quoteUsd,
        progress: 0,
        provider: step.provider,
        runId,
        status: "queued",
        stepId: step.stepId,
      }),
    ),
  );

  return {
    execution: { inputs: executionInputs, live, planned, provider, quoteUsd, runId, userAccessToken, zap },
    response: {
      message: `Queued ${zap.zap} with ${steps.length} planned steps.`,
      quoteUsd,
      runId,
      status: "queued",
      statusUrl: `/runs/${runId}`,
      steps,
    },
  };
}

export function startZapRunExecution(ticket: ZapExecutionTicket) {
  void executeZapRun(ticket);
}

export async function executeZapRun({ inputs, live = false, planned, provider, quoteUsd, runId, userAccessToken, zap }: ZapExecutionTicket) {
  let costUsd = 0;
  let zapUrl: string | undefined;
  const assetUrls = new Map<string, string>();
  let activeStep: ZapStep | undefined;
  let activeStepQuoteUsd = 0;
  let lastVideoOutputUrl: string | undefined;
  let lastVideoStepId: string | undefined;

  try {
    const existingSnapshot = await getRunSnapshot(runId);
    costUsd = existingSnapshot.run?.costUsd ?? 0;
    zapUrl = existingSnapshot.run?.zapUrl;
    const existingSteps = new Map(existingSnapshot.steps.map((step) => [step.stepId, step]));
    for (const asset of existingSnapshot.assets) {
      assetUrls.set(asset.stepId, asset.url);
    }
    const humanRetryCounts = countHumanRetries(existingSnapshot);
    const lastCompletedVideo = findLastCompletedVideo(planned, existingSteps, assetUrls);
    lastVideoOutputUrl = lastCompletedVideo?.url;
    lastVideoStepId = lastCompletedVideo?.stepId;

    await updateRunLedger({ costUsd, runId, stage: "normalizing_inputs", status: "running" });
    const normalizedInputs = await normalizeInputAssets(runId, inputs);

    for (const step of planned) {
      await assertRunNotCanceled(runId);
      activeStep = step;
      const stepQuoteUsd = quoteForStep(zap, runId, step, normalizedInputs);
      activeStepQuoteUsd = stepQuoteUsd;
      const existingStep = existingSteps.get(step.id);
      if (existingStep?.status === "done" && assetUrls.has(step.id)) {
        if (isVideoStep(step)) {
          lastVideoOutputUrl = assetUrls.get(step.id);
          lastVideoStepId = step.id;
        }
        continue;
      }
      await upsertStepLedger({
        kind: step.kind,
        model: step.model,
        priceQuoteUsd: stepQuoteUsd,
        progress: 0.05,
        provider: step.provider ?? zap.defaults.provider,
        runId,
        status: "running",
        stepId: step.id,
      });
      await updateRunLedger({ costUsd, runId, stage: step.id, status: "running" });

      if (isLocalStep(step)) {
        const inputUrls = resolveAssetRefs(step.inputs ?? [], normalizedInputs, assetUrls);
        const localResult = await executeLocalMediaStep({ inputUrls, runId, step });
        if (step.kind === "stitch") zapUrl = localResult.url;
        assetUrls.set(step.id, localResult.url);
        await addAssetLedger({
          durationS: localResult.durationS,
          height: localResult.height,
          kind: localResult.kind,
          parents: localResult.parents,
          runId,
          stepId: step.id,
          storageKey: localResult.storageKey,
          url: localResult.url,
          width: localResult.width,
        });
        await upsertStepLedger({
          kind: step.kind,
          model: step.model,
          priceQuoteUsd: stepQuoteUsd,
          progress: 1,
          provider: "local",
          runId,
          status: "done",
          stepId: step.id,
        });
        await updateRunLedger({ costUsd, runId, stage: step.id, status: "running", zapUrl });
        continue;
      }

      const judgeConfig = judgeConfigForStep(step);
      const retryPolicy = step.retry;
      const judgeAttempts = judgeConfig ? step.candidates ?? 1 : 1;
      const maxAttempts = Math.max(judgeAttempts, (retryPolicy?.max ?? 0) + 1);
      const conditioning = await prepareProviderConditioning({
        lastVideoOutputUrl,
        lastVideoStepId,
        runId,
        step,
      });
      let accepted = false;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const attemptStep = stepForAttempt(step, attempt);
        const attemptQuoteUsd = attempt === 1 ? stepQuoteUsd : quoteForStep(zap, runId, attemptStep, normalizedInputs);
        try {
          const request = await buildGenerationRequest(zap, runId, attemptStep, normalizedInputs, assetUrls, conditioning.imageUrls, {
            provider,
            userAccessToken,
          });
          request.attemptSalt = attemptSalt(step.id, attempt, humanRetryCounts);
          const submitted = await submitGeneration(request);
          await upsertStepLedger({
            idemKey: submitted.idemKey,
            kind: attemptStep.kind,
            model: attemptStep.model,
            priceQuoteUsd: attemptQuoteUsd,
            progress: 0.1,
            provider: submitted.provider,
            providerRequestId: submitted.requestId,
            runId,
            status: "running",
            stepId: step.id,
          });

          const result = await pollGenerationUntilDone(submitted.provider, submitted.requestId, request.secrets, async (progress) => {
            await upsertStepLedger({
              idemKey: submitted.idemKey,
              kind: attemptStep.kind,
              model: attemptStep.model,
              priceQuoteUsd: attemptQuoteUsd,
              progress,
              provider: submitted.provider,
              providerRequestId: submitted.requestId,
              runId,
              status: "running",
              stepId: step.id,
            });
          });
          await assertRunNotCanceled(runId);
          if (!result.outputUrl) {
            throw new ZapRunError({
              code: "PROVIDER_UNSUPPORTED",
              message: `Provider ${submitted.provider} completed ${step.id} without an output URL.`,
              remediation: "Check the provider adapter output parser for this model and add the correct URL extraction path.",
              retryable: true,
            });
          }

          const stored = await persistStepOutput(runId, step, result.outputUrl);
          const assetUrl = stored?.url ?? result.outputUrl;
          const actualUsd = result.actualUsd ?? attemptQuoteUsd;
          costUsd += actualUsd;

          const assetId = await addAssetLedger({
            kind: inferAssetKind(step, assetUrl),
            parents: [...(step.inputs ?? []), ...(step.reference_images ?? [])],
            runId,
            stepId: step.id,
            storageKey: stored?.storageKey,
            url: assetUrl,
          });

          const judgeResult = judgeConfig
            ? await judgeAsset({
              assetId,
              assetUrl,
              criteria: judgeConfig.criteria,
              runId,
              stepId: step.id,
              threshold: judgeConfig.threshold,
            })
            : null;

          if (judgeResult && !judgeResult.passed) {
            const payload = judgeFailurePayload(judgeResult);
            const canRetry = attempt < maxAttempts && costUsd + attemptQuoteUsd <= zap.budget.cap_usd;
            if (canRetry) {
              await upsertStepLedger({
                actualUsd,
                error: JSON.stringify(payload),
                idemKey: submitted.idemKey,
                kind: attemptStep.kind,
                model: attemptStep.model,
                priceQuoteUsd: attemptQuoteUsd,
                progress: attempt / maxAttempts,
                provider: submitted.provider,
                providerRequestId: submitted.requestId,
                runId,
                status: "running",
                stepId: step.id,
              });
              await updateRunLedger({ costUsd, runId, stage: `${step.id}:judge_retry_${attempt + 1}`, status: "running", zapUrl });
              await sleepRetryBackoff(retryPolicy);
              continue;
            }

            await upsertStepLedger({
              actualUsd,
              error: JSON.stringify(payload),
              idemKey: submitted.idemKey,
              kind: attemptStep.kind,
              model: attemptStep.model,
              priceQuoteUsd: attemptQuoteUsd,
              progress: 1,
              provider: submitted.provider,
              providerRequestId: submitted.requestId,
              runId,
              status: "waiting",
              stepId: step.id,
            });
            await updateRunLedger({
              costUsd,
              error: JSON.stringify(payload),
              runId,
              stage: `${step.id}:judge_review`,
              status: "waiting",
              zapUrl,
            });
            return;
          }

          assetUrls.set(step.id, assetUrl);
          if (isVideoStep(step)) {
            zapUrl = assetUrl;
            lastVideoOutputUrl = assetUrl;
            lastVideoStepId = step.id;
          }
          await upsertStepLedger({
            actualUsd,
            idemKey: submitted.idemKey,
            kind: attemptStep.kind,
            model: attemptStep.model,
            priceQuoteUsd: attemptQuoteUsd,
            progress: 1,
            provider: submitted.provider,
            providerRequestId: submitted.requestId,
            runId,
            status: "done",
            stepId: step.id,
          });
          await updateRunLedger({ costUsd, runId, stage: step.id, status: "running", zapUrl });
          accepted = true;
          break;
        } catch (error) {
          const payload = toZapErrorPayload(error);
          const retryable = payload.retryable || Boolean(retryPolicy);
          const canRetry = retryable && attempt < maxAttempts && costUsd + attemptQuoteUsd <= zap.budget.cap_usd;
          if (!canRetry) throw error;
          await upsertStepLedger({
            error: JSON.stringify(payload),
            kind: attemptStep.kind,
            model: attemptStep.model,
            priceQuoteUsd: attemptQuoteUsd,
            progress: attempt / maxAttempts,
            provider: attemptStep.provider ?? step.provider ?? zap.defaults.provider,
            runId,
            status: "running",
            stepId: step.id,
          });
          await updateRunLedger({ costUsd, runId, stage: `${step.id}:retry_${attempt + 1}`, status: "running", zapUrl });
          await sleepRetryBackoff(retryPolicy);
          continue;
        }
      }

      if (!accepted) return;
    }

    await updateRunLedger({
      costUsd,
      runId,
      stage: "complete",
      status: "done",
      zapUrl,
    });
  } catch (error) {
    const payload = toZapErrorPayload(error);
    const status = payload.code === "RUN_CANCELED" ? "canceled" : "failed";
    if (activeStep) {
      await upsertStepLedger({
        error: JSON.stringify(payload),
        kind: activeStep.kind,
        model: activeStep.model,
        priceQuoteUsd: activeStepQuoteUsd,
        progress: status === "canceled" ? 0 : 1,
        provider: isLocalStep(activeStep) ? "local" : activeStep.provider ?? zap.defaults.provider,
        runId,
        status,
        stepId: activeStep.id,
      });
    }
    await updateRunLedger({
      costUsd,
      error: JSON.stringify(payload),
      runId,
      stage: status,
      status,
      zapUrl,
    });
  }
}

export async function getZapRunStatus(runId: string): Promise<RunSnapshot> {
  const snapshot = await getRunSnapshot(runId);
  if (!snapshot.run) return snapshot;
  const zap = await loadZapSpec(snapshot.run.zapSlug);
  if (!zap) return snapshot;
  return getRunSnapshot(runId, zap.budget.cap_usd);
}

export async function cancelZapRun(runId: string, reason = "Canceled by user or agent request.") {
  const snapshot = await getRunSnapshot(runId);
  if (!snapshot.run) {
    throw new ZapRunError({
      code: "RUN_NOT_FOUND",
      message: `Run ${runId} was not found.`,
      remediation: "Check the run id returned by run_zap and retry.",
      retryable: false,
    });
  }
  const payload = {
    code: "RUN_CANCELED" as const,
    message: reason,
    remediation: "Submit a new run when you are ready to continue.",
    retryable: false,
  };
  await updateRunLedger({
    costUsd: snapshot.run.costUsd,
    error: JSON.stringify(payload),
    runId,
    stage: "canceled",
    status: "canceled",
    zapUrl: snapshot.run.zapUrl,
  });
  await Promise.all(
    snapshot.steps
      .filter((step) => step.status === "queued" || step.status === "running")
      .map((step) =>
        upsertStepLedger({
          ...step,
          error: JSON.stringify(payload),
          progress: step.progress ?? 0,
          status: "canceled",
        }),
      ),
  );
  return getZapRunStatus(runId);
}

export async function approveWaitingZapRun(runId: string, comment = "Approved by human review.") {
  const snapshot = await getRunSnapshot(runId);
  if (!snapshot.run || snapshot.run.status !== "waiting") {
    throw new ZapRunError({
      code: "RUN_NOT_FOUND",
      message: `Run ${runId} is not waiting for human review.`,
      remediation: "Open a run currently in waiting status before approving a judge gate.",
      retryable: false,
    });
  }

  const waitingStep = snapshot.steps.find((step) => step.status === "waiting");
  if (!waitingStep) {
    throw new ZapRunError({
      code: "RUN_NOT_FOUND",
      message: `Run ${runId} has no waiting step to approve.`,
      remediation: "Refresh the run state and retry if a judge gate is still waiting.",
      retryable: false,
    });
  }

  const asset = [...snapshot.assets].reverse().find((candidate) => candidate.stepId === waitingStep.stepId);
  await addFeedbackLedger({
    assetId: asset?._id,
    comment,
    kind: "rlhf_vote",
    rater: "human",
    runId,
    scores: { approved: true, vote: "up" },
    stepId: waitingStep.stepId,
  });
  await upsertStepLedger({
    actualUsd: waitingStep.actualUsd,
    idemKey: waitingStep.idemKey,
    kind: waitingStep.kind,
    model: waitingStep.model,
    priceQuoteUsd: waitingStep.priceQuoteUsd,
    progress: 1,
    provider: waitingStep.provider,
    providerRequestId: waitingStep.providerRequestId,
    runId,
    status: "done",
    stepId: waitingStep.stepId,
  });
  await updateRunLedger({
    costUsd: snapshot.run.costUsd,
    runId,
    stage: `${waitingStep.stepId}:human_approved`,
    status: "running",
    zapUrl: snapshot.run.zapUrl,
  });

  return resumeZapRun(runId);
}

export async function retryWaitingZapRun(runId: string, comment = "Rejected by human review; regenerate.") {
  const snapshot = await getRunSnapshot(runId);
  if (!snapshot.run || snapshot.run.status !== "waiting") {
    throw new ZapRunError({
      code: "RUN_NOT_FOUND",
      message: `Run ${runId} is not waiting for human review.`,
      remediation: "Open a run currently in waiting status before requesting regeneration.",
      retryable: false,
    });
  }
  const waitingStep = snapshot.steps.find((step) => step.status === "waiting");
  const asset = waitingStep
    ? [...snapshot.assets].reverse().find((candidate) => candidate.stepId === waitingStep.stepId)
    : undefined;
  await addFeedbackLedger({
    assetId: asset?._id,
    comment,
    kind: "rlhf_vote",
    rater: "human",
    runId,
    scores: { approved: false, vote: "down" },
    stepId: waitingStep?.stepId,
  });
  return resumeZapRun(runId);
}

export async function resumeZapRun(runId: string) {
  const snapshot = await getRunSnapshot(runId);
  if (!snapshot.run) {
    throw new ZapRunError({
      code: "RUN_NOT_FOUND",
      message: `Run ${runId} was not found.`,
      remediation: "Check the run id returned by run_zap and retry.",
      retryable: false,
    });
  }
  if (snapshot.run.status === "done") return getZapRunStatus(runId);

  const zap = await loadZapSpec(snapshot.run.zapSlug);
  if (!zap) {
    throw new ZapRunError({
      code: "UNKNOWN_ZAP",
      message: `Unknown Zap ${snapshot.run.zapSlug}.`,
      remediation: "Restore the recipe used by this run or compile a new Zap from the trace.",
      retryable: false,
    });
  }
  if (!isRecord(snapshot.run.inputs)) {
    throw new ZapRunError({
      code: "RUN_NOT_FOUND",
      message: `Run ${runId} does not have resumable inputs.`,
      remediation: "Start a new run with the current runner so normalized inputs are stored in the ledger.",
      retryable: false,
    });
  }

  const planned = planStepsFromSnapshot(zap, snapshot);
  await updateRunLedger({
    costUsd: snapshot.run.costUsd,
    runId,
    stage: "resuming",
    status: "running",
    zapUrl: snapshot.run.zapUrl,
  });
  startZapRunExecution({
    inputs: snapshot.run.inputs,
    live: true,
    planned,
    quoteUsd: snapshot.steps.reduce((sum, step) => sum + step.priceQuoteUsd, 0),
    runId,
    zap,
  });
  return getZapRunStatus(runId);
}

export async function prepareRerunZapRunFromStep(runId: string, stepId: string, comment = `Re-run from ${stepId}.`) {
  const snapshot = await getRunSnapshot(runId);
  if (!snapshot.run) {
    throw new ZapRunError({
      code: "RUN_NOT_FOUND",
      message: `Run ${runId} was not found.`,
      remediation: "Check the run id returned by run_zap and retry.",
      retryable: false,
    });
  }
  if (snapshot.run.status === "running" || snapshot.run.status === "queued") {
    throw new ZapRunError({
      code: "INVALID_INPUT",
      message: `Run ${runId} is already ${snapshot.run.status}.`,
      remediation: "Wait for the current execution to finish or cancel it before re-running from a step.",
      retryable: true,
    });
  }

  const zap = await loadZapSpec(snapshot.run.zapSlug);
  if (!zap) {
    throw new ZapRunError({
      code: "UNKNOWN_ZAP",
      message: `Unknown Zap ${snapshot.run.zapSlug}.`,
      remediation: "Restore the recipe used by this run or compile a new Zap from the trace.",
      retryable: false,
    });
  }
  if (!isRecord(snapshot.run.inputs)) {
    throw new ZapRunError({
      code: "RUN_NOT_FOUND",
      message: `Run ${runId} does not have resumable inputs.`,
      remediation: "Start a new run with the current runner so normalized inputs are stored in the ledger.",
      retryable: false,
    });
  }

  const planned = planStepsFromSnapshot(zap, snapshot);
  const rerunIndex = planned.findIndex((step) => step.id === stepId);
  if (rerunIndex === -1) {
    throw new ZapRunError({
      alternatives: snapshot.steps.map((step) => step.stepId),
      code: "INVALID_INPUT",
      message: `Step ${stepId} is not part of run ${runId}.`,
      remediation: "Choose one of the step ids returned by get_run_status, then retry.",
      retryable: false,
    });
  }

  const existingSteps = new Map(snapshot.steps.map((step) => [step.stepId, step]));
  const rerunSteps = planned.slice(rerunIndex);
  await addFeedbackLedger({
    comment,
    kind: "rlhf_vote",
    rater: "human",
    runId,
    scores: { rerunFrom: stepId, vote: "down" },
    stepId,
  });
  await Promise.all(
    rerunSteps.map((step) => {
      const existing = existingSteps.get(step.id);
      return upsertStepLedger({
        kind: step.kind,
        model: step.model ?? existing?.model,
        priceQuoteUsd: existing?.priceQuoteUsd ?? quoteForStep(zap, runId, step, snapshot.run!.inputs as Record<string, unknown>),
        progress: 0,
        provider: isLocalStep(step) ? "local" : step.provider ?? zap.defaults.provider,
        runId,
        status: "queued",
        stepId: step.id,
      });
    }),
  );
  await updateRunLedger({
    costUsd: snapshot.run.costUsd,
    runId,
    stage: `rerun_from:${stepId}`,
    status: "running",
    zapUrl: snapshot.run.zapUrl,
  });

  return {
    execution: {
      inputs: snapshot.run.inputs,
      live: true,
      planned,
      quoteUsd: snapshot.steps.reduce((sum, step) => sum + step.priceQuoteUsd, 0),
      runId,
      zap,
    },
    snapshot: await getZapRunStatus(runId),
  };
}

export async function rerunZapRunFromStep(runId: string, stepId: string, comment = `Re-run from ${stepId}.`) {
  const prepared = await prepareRerunZapRunFromStep(runId, stepId, comment);
  startZapRunExecution(prepared.execution);
  return prepared.snapshot;
}

export async function buildGenerationRequest(
  zap: ZapSpec,
  runId: string,
  step: ZapStep,
  inputs: Record<string, unknown>,
  assetUrls = new Map<string, string>(),
  conditioningImageUrls: string[] = [],
  options: { provider?: ProviderId; userAccessToken?: string } = {},
): Promise<GenRequest> {
  const prompt = interpolate(await readPrompt(zap.zap, step.prompt), inputs);
  const imageUrls = uniqueUrls([...conditioningImageUrls, ...resolveImageUrls(step, inputs, assetUrls)]);
  const selectedProvider = options.provider ?? step.provider ?? zap.defaults.provider;
  const model = step.model ?? zap.defaults.models?.[step.kind] ?? defaultProviderModel(selectedProvider, step.kind);
  return {
    capability: step.kind,
    durationS: step.duration_s,
    inputs: {
      ...inputs,
      firstFrameUrl: conditioningImageUrls.at(0),
      imageUrl: imageUrls.at(0),
      imageUrls,
      referenceImages: imageUrls,
    },
    model,
    prompt,
    provider: selectedProvider,
    runId,
    secrets: await revealZapSecretsForProvider(selectedProvider, options.userAccessToken),
    stepId: step.id,
  };
}

export async function persistStepOutput(runId: string, step: ZapStep, outputUrl?: string) {
  if (!outputUrl) return null;
  if (outputUrl.startsWith("data:")) {
    return persistDataUrlAsset(outputUrl, `runs/${runId}/${step.id}/${Date.now()}`);
  }
  return persistRemoteAsset(outputUrl, `runs/${runId}/${step.id}/${Date.now()}`);
}

function validateInputs(zap: ZapSpec, inputs: Record<string, unknown>) {
  for (const [name, spec] of Object.entries(zap.inputs)) {
    if (spec.required && inputs[name] === undefined) {
      throw new ZapRunError({
        code: "INVALID_INPUT",
        message: `Missing required input ${name}.`,
        remediation: `Provide ${name} before running ${zap.zap}.`,
        retryable: false,
      });
    }
  }
}

async function normalizeInputAssets(runId: string, inputs: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(inputs)) {
    normalized[name] = typeof value === "string" && value.startsWith("data:")
      ? (await persistDataUrlAsset(value, `runs/${runId}/inputs/${name}`)).url
      : value;
  }
  return normalized;
}

function planSteps(zap: ZapSpec, extendCount: number) {
  return zap.steps.flatMap((step) => {
    if (step.kind !== "video.extend") return [step];
    const max = step.repeat?.max ?? 64;
    const count = Math.min(extendCount, max);
    return Array.from({ length: count }, (_, index) => ({ ...step, id: `${step.id}_${index + 1}` }));
  });
}

function planStepsFromSnapshot(zap: ZapSpec, snapshot: RunSnapshot) {
  const stepOrder = snapshot.steps.map((step) => step.stepId);
  return zap.steps.flatMap((step) => {
    if (step.kind !== "video.extend") return [step];
    return stepOrder
      .filter((stepId) => stepId === step.id || stepId.startsWith(`${step.id}_`))
      .map((stepId) => ({ ...step, id: stepId }));
  });
}

async function describePlannedSteps(
  zap: ZapSpec,
  runId: string,
  planned: ZapStep[],
  inputs: Record<string, unknown>,
  includePrompts: boolean,
): Promise<RunZapSubmittedStep[]> {
  return Promise.all(
    planned.map(async (step) => ({
      kind: step.kind,
      model: isLocalStep(step)
        ? step.model
        : step.model ?? zap.defaults.models?.[step.kind] ?? defaultProviderModel(step.provider ?? zap.defaults.provider, step.kind),
      prompt: includePrompts ? interpolate(await readPrompt(zap.zap, step.prompt), inputs) : undefined,
      provider: isLocalStep(step) ? "local" : step.provider ?? zap.defaults.provider,
      quoteUsd: quoteForStep(zap, runId, step, inputs),
      status: includePrompts ? "planned" : "queued",
      stepId: step.id,
    })),
  );
}

function quoteForStep(zap: ZapSpec, runId: string, step: ZapStep, inputs: Record<string, unknown>) {
  if (isLocalStep(step)) return 0;
  const provider = step.provider ?? zap.defaults.provider;
  const model = step.model ?? zap.defaults.models?.[step.kind] ?? defaultProviderModel(provider, step.kind);
  return quoteGeneration({
    capability: step.kind,
    durationS: step.duration_s,
    inputs,
    model,
    prompt: "",
    provider,
    runId,
    stepId: step.id,
  });
}

function isLocalStep(step: ZapStep) {
  return step.kind === "stitch" || step.kind === "keyframes";
}

async function prepareProviderConditioning({
  lastVideoOutputUrl,
  lastVideoStepId,
  runId,
  step,
}: {
  lastVideoOutputUrl?: string;
  lastVideoStepId?: string;
  runId: string;
  step: ZapStep;
}) {
  const firstFrame = await prepareExtendFirstFrame({
    parentStepId: lastVideoStepId,
    previousVideoUrl: lastVideoOutputUrl,
    runId,
    step,
  });
  if (!firstFrame) return { imageUrls: [] as string[] };

  await addAssetLedger({
    durationS: firstFrame.durationS,
    height: firstFrame.height,
    kind: firstFrame.kind,
    parents: firstFrame.parents,
    runId,
    stepId: `${step.id}:first_frame`,
    storageKey: firstFrame.storageKey,
    url: firstFrame.url,
    width: firstFrame.width,
  });
  return { imageUrls: [firstFrame.url] };
}

function findLastCompletedVideo(
  planned: ZapStep[],
  existingSteps: Map<string, RunSnapshot["steps"][number]>,
  assetUrls: Map<string, string>,
) {
  let last: { stepId: string; url: string } | undefined;
  for (const step of planned) {
    if (!isVideoStep(step)) continue;
    if (existingSteps.get(step.id)?.status !== "done") continue;
    const url = assetUrls.get(step.id);
    if (url) last = { stepId: step.id, url };
  }
  return last;
}

function countHumanRetries(snapshot: RunSnapshot) {
  const counts = new Map<string, number>();
  for (const entry of snapshot.feedback) {
    const scores = entry.scores as { vote?: string } | undefined;
    if (entry.kind !== "rlhf_vote" || scores?.vote !== "down" || !entry.stepId) continue;
    counts.set(entry.stepId, (counts.get(entry.stepId) ?? 0) + 1);
  }
  return counts;
}

function attemptSalt(stepId: string, attempt: number, counts: Map<string, number>) {
  const count = counts.get(stepId) ?? 0;
  if (attempt > 1 && count > 0) return `human-retry-${count}:judge-retry-${attempt}`;
  if (attempt > 1) return `judge-retry-${attempt}`;
  return count > 0 ? `human-retry-${count}` : undefined;
}

function stepForAttempt(step: ZapStep, attempt: number): ZapStep {
  if (attempt <= 1 || !step.retry) return step;
  return {
    ...step,
    model: step.retry.fallback_model ?? step.model,
    provider: step.retry.fallback_provider ?? step.provider,
  };
}

async function sleepRetryBackoff(retry?: ZapStep["retry"]) {
  const backoffMs = Math.max(0, retry?.backoff_s ?? 0) * 1000;
  if (backoffMs > 0) await sleep(backoffMs);
}

function isVideoStep(step: ZapStep) {
  return step.kind.startsWith("video.");
}

function resolveImageUrls(step: ZapStep, inputs: Record<string, unknown>, assetUrls: Map<string, string>) {
  const urls: string[] = [];
  for (const ref of [...(step.inputs ?? []), ...(step.reference_images ?? [])]) {
    const url = resolveRef(ref, inputs, assetUrls);
    if (url) urls.push(url);
  }
  const userImage = typeof inputs.image === "string" ? inputs.image : undefined;
  if (urls.length === 0 && userImage) urls.push(userImage);
  return urls;
}

function resolveAssetRefs(refs: string[], inputs: Record<string, unknown>, assetUrls: Map<string, string>) {
  return refs.flatMap((ref) => {
    if (ref.endsWith(".*")) {
      const prefix = ref.slice(0, -2);
      return Array.from(assetUrls.entries())
        .filter(([stepId]) => stepId === prefix || stepId.startsWith(`${prefix}_`))
        .map(([, url]) => url);
    }
    const url = resolveRef(ref, inputs, assetUrls);
    return url ? [url] : [];
  });
}

function resolveRef(ref: string, inputs: Record<string, unknown>, assetUrls: Map<string, string>) {
  if (ref.startsWith("user.")) {
    const value = inputs[ref.slice("user.".length)];
    return typeof value === "string" ? value : undefined;
  }
  const assetUrl = assetUrls.get(ref);
  if (assetUrl) return assetUrl;
  const inputValue = inputs[ref];
  return typeof inputValue === "string" ? inputValue : undefined;
}

function uniqueUrls(urls: string[]) {
  return Array.from(new Set(urls.filter(Boolean)));
}

async function pollGenerationUntilDone(
  provider: string,
  requestId: string,
  secrets: ProviderSecrets | undefined,
  onProgress: (progress: number) => Promise<void>,
) {
  const deadline = Date.now() + Number(process.env.ZAP_SYNC_POLL_TIMEOUT_MS ?? 1000 * 60 * 20);
  const delayMs = Number(process.env.ZAP_SYNC_POLL_INTERVAL_MS ?? 5000);
  while (Date.now() < deadline) {
    const result = await pollGeneration(provider, requestId, secrets);
    if (result.status === "done") return result;
    if (result.status === "failed") {
      throw new ZapRunError({
        code: "PROVIDER_UNSUPPORTED",
        message: result.error ?? `${provider} generation ${requestId} failed.`,
        remediation: "Retry the step if the provider error is transient, or switch to a fallback provider/model.",
        retryable: true,
      });
    }
    await onProgress(result.progress ?? 0.25);
    await sleep(delayMs);
  }
  throw new ZapRunError({
    code: "PROVIDER_UNSUPPORTED",
    message: `${provider} generation ${requestId} did not finish before the poll timeout.`,
    remediation: "Use get_run_status later, increase ZAP_SYNC_POLL_TIMEOUT_MS, or rely on provider webhooks for this model.",
    retryable: true,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function interpolate(template: string, inputs: Record<string, unknown>) {
  return template.replace(/\{([A-Z0-9_]+)\}/g, (_, name) => String(inputs[name] ?? ""));
}

function summarizeInputs(inputs: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => {
      if (typeof value !== "string") return [key, value];
      if (value.startsWith("data:")) {
        const mime = value.match(/^data:([^;,]+)/)?.[1] ?? "data";
        return [key, `[${mime} data URL, ${value.length} chars]`];
      }
      return [key, value.length > 300 ? `${value.slice(0, 300)}...` : value];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inferAssetKind(step: ZapStep, url: string) {
  if (url.includes("video/") || step.kind.startsWith("video.") || step.kind === "stitch") return "mp4";
  if (url.includes("audio/") || step.kind.startsWith("audio.")) return "wav";
  if (url.includes("json")) return "json";
  return "png";
}

async function assertRunNotCanceled(runId: string) {
  const snapshot = await getRunSnapshot(runId);
  if (snapshot.run?.status !== "canceled") return;
  throw new ZapRunError({
    code: "RUN_CANCELED",
    message: `Run ${runId} was canceled.`,
    remediation: "Submit a new run if you want to regenerate this Zap.",
    retryable: false,
  });
}
