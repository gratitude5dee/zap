export function publicRunSnapshot(snapshot: {
  assets: any[];
  feedback: any[];
  run: any | null;
  steps: any[];
}) {
  // Air is a private iMessage service. Its run IDs and temporary Blob URLs
  // must never become a public capability, even if a caller obtains a run ID.
  if (snapshot.run?.zapSlug === "air-imessage-video") {
    return { assets: [], feedback: [], run: null, steps: [] };
  }
  return {
    assets: snapshot.assets.map((asset) => ({
      _id: asset._id,
      durationS: asset.durationS,
      height: asset.height,
      kind: asset.kind,
      parents: asset.parents,
      runId: asset.runId,
      stepId: asset.stepId,
      url: asset.url,
      width: asset.width,
    })),
    feedback: snapshot.feedback.map((feedback) => ({
      _id: feedback._id,
      assetId: feedback.assetId,
      comment: feedback.comment,
      createdAt: feedback.createdAt,
      kind: feedback.kind,
      runId: feedback.runId,
      scores: feedback.scores,
      stepId: feedback.stepId,
    })),
    run: snapshot.run ? {
      costUsd: snapshot.run.costUsd,
      error: snapshot.run.error,
      finishedAt: snapshot.run.finishedAt,
      runId: snapshot.run.runId,
      stage: snapshot.run.stage,
      startedAt: snapshot.run.startedAt,
      status: snapshot.run.status,
      zapSlug: snapshot.run.zapSlug,
      zapUrl: snapshot.run.zapUrl,
      zapVersion: snapshot.run.zapVersion,
    } : null,
    steps: snapshot.steps.map((step) => ({
      actualUsd: step.actualUsd,
      error: step.error,
      kind: step.kind,
      model: step.model,
      priceQuoteUsd: step.priceQuoteUsd,
      progress: step.progress,
      provider: step.provider,
      runId: step.runId,
      status: step.status,
      stepId: step.stepId,
    })),
  };
}
