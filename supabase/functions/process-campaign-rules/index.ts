import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

const META_API_BASE = "https://graph.facebook.com/v22.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type RuleRow = {
  id: string;
  account_id: string;
  campaign_id: string;
  action: "pause" | "reduce_budget";
  reduce_percent: number | null;
  schedule_start: number;
  schedule_end: number;
  timezone: string | null;
  enabled: boolean;
};

type StateRow = {
  rule_id: string;
  entity_id: string;
  entity_type: "campaign" | "adset";
  action: "pause" | "reduce_budget";
  original_status: string | null;
  original_daily_budget: number | null;
};

type TargetEntity = {
  entityId: string;
  entityType: "campaign" | "adset";
  name: string;
  status: string;
  dailyBudget: number;
};

function roundMoney(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function parseMoneyFromCents(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? Math.round((parsed / 100) * 100) / 100 : 0;
}

function toBudgetPayload(value: number): string {
  return String(Math.max(0, Math.round(roundMoney(value) * 100)));
}

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function isStatusRestorable(value: unknown): boolean {
  const status = normalizeStatus(value);
  return status === "ACTIVE" || status === "PAUSED";
}

function buildStateKey(ruleId: string, entityId: string) {
  return `${ruleId}__${entityId}`;
}

function getHourInTimeZone(timeZone: string, now = new Date()): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).format(now);
  const parsed = Number.parseInt(formatted, 10);
  return Number.isFinite(parsed) ? parsed : now.getUTCHours();
}

function isRuleActiveNow(rule: RuleRow, now = new Date()): boolean {
  const timeZone = rule.timezone || "America/Bahia";
  const currentHour = getHourInTimeZone(timeZone, now);
  const start = Number(rule.schedule_start);
  const end = Number(rule.schedule_end);

  if (start === end) return true;
  if (start < end) return currentHour >= start && currentHour < end;
  return currentHour >= start || currentHour < end;
}

function computeReducedBudget(originalBudget: number, reducePercent: number): number {
  const safeBudget = Math.max(0, roundMoney(originalBudget));
  const safePercent = Math.min(100, Math.max(0, roundMoney(reducePercent)));
  const reduced = safeBudget * (1 - safePercent / 100);
  return Math.max(1, roundMoney(reduced));
}

function budgetChanged(currentBudget: number, nextBudget: number): boolean {
  return Math.abs(roundMoney(currentBudget) - roundMoney(nextBudget)) >= 0.01;
}

async function fetchMeta(
  token: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
) {
  const url = new URL(`${META_API_BASE}${path}`);
  url.searchParams.append("access_token", token);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.append(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error?.message || `Meta API GET ${response.status}`);
  }

  return data;
}

async function postMeta(
  token: string,
  path: string,
  body: Record<string, string | number>,
) {
  const url = new URL(`${META_API_BASE}${path}`);
  url.searchParams.append("access_token", token);

  const formData = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    formData.append(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error?.message || `Meta API POST ${response.status}`);
  }

  return data;
}

async function fetchCampaign(token: string, campaignId: string): Promise<TargetEntity | null> {
  const data = await fetchMeta(token, `/${campaignId}`, {
    fields: "id,name,status,daily_budget",
  });

  if (!data?.id) return null;
  return {
    entityId: data.id,
    entityType: "campaign",
    name: data.name || data.id,
    status: normalizeStatus(data.status),
    dailyBudget: parseMoneyFromCents(data.daily_budget),
  };
}

async function fetchAdSet(token: string, adSetId: string): Promise<TargetEntity | null> {
  const data = await fetchMeta(token, `/${adSetId}`, {
    fields: "id,name,status,daily_budget",
  });

  if (!data?.id) return null;
  return {
    entityId: data.id,
    entityType: "adset",
    name: data.name || data.id,
    status: normalizeStatus(data.status),
    dailyBudget: parseMoneyFromCents(data.daily_budget),
  };
}

async function fetchAccountCampaigns(token: string, accountId: string): Promise<TargetEntity[]> {
  const data = await fetchMeta(token, `/${accountId}/campaigns`, {
    fields: "id,name,status,daily_budget",
    limit: 200,
  });

  return (data.data || []).map((campaign: Record<string, unknown>) => ({
    entityId: String(campaign.id || ""),
    entityType: "campaign" as const,
    name: String(campaign.name || campaign.id || "Campanha"),
    status: normalizeStatus(campaign.status),
    dailyBudget: parseMoneyFromCents(campaign.daily_budget),
  })).filter((campaign: TargetEntity) => campaign.entityId);
}

async function fetchCampaignAdSets(token: string, campaignId: string): Promise<TargetEntity[]> {
  const data = await fetchMeta(token, `/${campaignId}/adsets`, {
    fields: "id,name,status,daily_budget",
    limit: 200,
  });

  return (data.data || []).map((adSet: Record<string, unknown>) => ({
    entityId: String(adSet.id || ""),
    entityType: "adset" as const,
    name: String(adSet.name || adSet.id || "Conjunto"),
    status: normalizeStatus(adSet.status),
    dailyBudget: parseMoneyFromCents(adSet.daily_budget),
  })).filter((adSet: TargetEntity) => adSet.entityId);
}

async function updateEntityStatus(
  token: string,
  entityType: "campaign" | "adset",
  entityId: string,
  status: string,
) {
  if (entityType !== "campaign" && entityType !== "adset") return;
  await postMeta(token, `/${entityId}`, { status });
}

async function updateEntityBudget(
  token: string,
  entityType: "campaign" | "adset",
  entityId: string,
  budget: number,
) {
  if (entityType !== "campaign" && entityType !== "adset") return;
  await postMeta(token, `/${entityId}`, { daily_budget: toBudgetPayload(budget) });
}

async function resolveRuleTargets(
  token: string,
  rule: RuleRow,
): Promise<{ targets: TargetEntity[]; skippedMessage: string | null }> {
  if (rule.action === "pause") {
    if (rule.campaign_id === "all") {
      const campaigns = await fetchAccountCampaigns(token, rule.account_id);
      return { targets: campaigns, skippedMessage: campaigns.length === 0 ? "Nenhuma campanha encontrada na conta." : null };
    }

    const campaign = await fetchCampaign(token, rule.campaign_id);
    return {
      targets: campaign ? [campaign] : [],
      skippedMessage: campaign ? null : "Campanha nao encontrada para pausar.",
    };
  }

  const campaignTargets: TargetEntity[] = [];
  let skipped = 0;

  const sourceCampaigns: TargetEntity[] = rule.campaign_id === "all"
    ? await fetchAccountCampaigns(token, rule.account_id)
    : [];

  if (rule.campaign_id !== "all") {
    const campaign = await fetchCampaign(token, rule.campaign_id);
    if (!campaign) {
      return { targets: [], skippedMessage: "Campanha nao encontrada para reduzir verba." };
    }
    sourceCampaigns.push(campaign);
  }

  for (const campaign of sourceCampaigns) {
    if (campaign.dailyBudget > 0) {
      campaignTargets.push(campaign);
      continue;
    }

    const adSets = await fetchCampaignAdSets(token, campaign.entityId);
    const adSetsWithBudget = adSets.filter((adSet) => adSet.dailyBudget > 0);

    if (adSetsWithBudget.length === 0) {
      skipped += 1;
      continue;
    }

    campaignTargets.push(...adSetsWithBudget);
  }

  const skippedMessage = skipped > 0
    ? `${skipped} campanha(s) sem budget diario em campanha ou conjunto foram ignoradas.`
    : null;

  return { targets: campaignTargets, skippedMessage };
}

function buildLog(
  ruleId: string,
  entity: TargetEntity | { entityId: string; entityType: "campaign" | "adset" },
  action: "pause" | "reduce_budget",
  operation: "apply" | "revert" | "skip" | "error",
  message: string,
) {
  return {
    rule_id: ruleId,
    entity_id: entity.entityId,
    entity_type: entity.entityType,
    action,
    operation,
    message,
  };
}

async function applyRuleToTarget(
  token: string,
  rule: RuleRow,
  target: TargetEntity,
  existingState?: StateRow,
) {
  const nowIso = new Date().toISOString();

  if (rule.action === "pause") {
    const originalStatus = isStatusRestorable(existingState?.original_status)
      ? normalizeStatus(existingState?.original_status)
      : isStatusRestorable(target.status)
        ? normalizeStatus(target.status)
        : "ACTIVE";

    if (target.status !== "PAUSED") {
      await updateEntityStatus(token, target.entityType, target.entityId, "PAUSED");
    }

    return {
      upsert: {
        rule_id: rule.id,
        entity_id: target.entityId,
        entity_type: target.entityType,
        action: rule.action,
        original_status: originalStatus,
        original_daily_budget: existingState?.original_daily_budget ?? null,
        applied: true,
        last_applied_at: nowIso,
        updated_at: nowIso,
      },
      log: buildLog(rule.id, target, rule.action, "apply", `Campanha colocada em pausa pela regra ${rule.id}.`),
      applied: true,
    };
  }

  const originalBudget = roundMoney(
    existingState?.original_daily_budget ?? target.dailyBudget,
  );

  if (originalBudget <= 0) {
    return {
      upsert: null,
      log: buildLog(rule.id, target, rule.action, "skip", "Entidade sem budget diario editavel para reducao."),
      applied: false,
    };
  }

  const reducedBudget = computeReducedBudget(
    originalBudget,
    Number(rule.reduce_percent || 0),
  );

  if (budgetChanged(target.dailyBudget, reducedBudget)) {
    await updateEntityBudget(token, target.entityType, target.entityId, reducedBudget);
  }

  return {
    upsert: {
      rule_id: rule.id,
      entity_id: target.entityId,
      entity_type: target.entityType,
      action: rule.action,
      original_status: existingState?.original_status ?? null,
      original_daily_budget: originalBudget,
      applied: true,
      last_applied_at: nowIso,
      updated_at: nowIso,
    },
    log: buildLog(
      rule.id,
      target,
      rule.action,
      "apply",
      `Budget ajustado para ${reducedBudget.toFixed(2)} a partir do original ${originalBudget.toFixed(2)}.`,
    ),
    applied: true,
  };
}

async function revertState(
  token: string,
  state: StateRow,
) {
  const entity = state.entity_type === "campaign"
    ? await fetchCampaign(token, state.entity_id)
    : await fetchAdSet(token, state.entity_id);

  if (!entity) {
    return {
      canDelete: true,
      reverted: false,
      log: buildLog(
        state.rule_id,
        { entityId: state.entity_id, entityType: state.entity_type },
        state.action,
        "skip",
        "Entidade nao encontrada para reverter; estado removido.",
      ),
    };
  }

  if (state.action === "pause") {
    const originalStatus = isStatusRestorable(state.original_status)
      ? normalizeStatus(state.original_status)
      : "";

    if (originalStatus && entity.status !== originalStatus) {
      await updateEntityStatus(token, entity.entityType, entity.entityId, originalStatus);
    }

    return {
      canDelete: true,
      reverted: true,
      log: buildLog(
        state.rule_id,
        entity,
        state.action,
        "revert",
        `Status restaurado para ${originalStatus || "estado original"}.`,
      ),
    };
  }

  const originalBudget = roundMoney(state.original_daily_budget);
  if (originalBudget > 0 && budgetChanged(entity.dailyBudget, originalBudget)) {
    await updateEntityBudget(token, entity.entityType, entity.entityId, originalBudget);
  }

  return {
    canDelete: true,
    reverted: true,
    log: buildLog(
      state.rule_id,
      entity,
      state.action,
      "revert",
      `Budget restaurado para ${originalBudget.toFixed(2)}.`,
    ),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaToken = Deno.env.get("META_ACCESS_TOKEN");

    if (!metaToken) {
      return new Response(
        JSON.stringify({ error: "META_ACCESS_TOKEN not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const [{ data: rules, error: rulesError }, { data: states, error: statesError }] =
      await Promise.all([
        supabase.from("campaign_rules").select("*"),
        supabase.from("campaign_rule_state").select("*"),
      ]);

    if (rulesError) throw rulesError;
    if (statesError) throw statesError;

    const allRules = (rules || []) as RuleRow[];
    const enabledRules = allRules.filter((rule) => rule.enabled);
    const stateRows = (states || []) as StateRow[];
    const stateMap = new Map<string, StateRow>();

    for (const state of stateRows) {
      stateMap.set(buildStateKey(state.rule_id, state.entity_id), state);
    }

    const keepStateKeys = new Set<string>();
    const stateUpserts: Record<string, unknown>[] = [];
    const stateDeletes: { rule_id: string; entity_id: string }[] = [];
    const logs: Record<string, unknown>[] = [];

    let appliedCount = 0;
    let revertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const rule of enabledRules) {
      if (!isRuleActiveNow(rule)) continue;

      try {
        const { targets, skippedMessage } = await resolveRuleTargets(metaToken, rule);
        if (skippedMessage && targets.length === 0) {
          logs.push({
            rule_id: rule.id,
            entity_id: rule.campaign_id,
            entity_type: "campaign",
            action: rule.action,
            operation: "skip",
            message: skippedMessage,
          });
          skippedCount += 1;
          continue;
        }

        if (skippedMessage) {
          logs.push({
            rule_id: rule.id,
            entity_id: rule.campaign_id,
            entity_type: "campaign",
            action: rule.action,
            operation: "skip",
            message: skippedMessage,
          });
        }

        for (const target of targets) {
          const key = buildStateKey(rule.id, target.entityId);
          keepStateKeys.add(key);

          try {
            const result = await applyRuleToTarget(
              metaToken,
              rule,
              target,
              stateMap.get(key),
            );

            if (result.upsert) {
              stateUpserts.push(result.upsert);
            }
            logs.push(result.log);
            if (result.applied) appliedCount += 1;
            else skippedCount += 1;
          } catch (error) {
            errorCount += 1;
            logs.push(buildLog(
              rule.id,
              target,
              rule.action,
              "error",
              `Falha ao aplicar regra: ${String(error)}`,
            ));
          }
        }
      } catch (error) {
        errorCount += 1;
        logs.push({
          rule_id: rule.id,
          entity_id: rule.campaign_id,
          entity_type: "campaign",
          action: rule.action,
          operation: "error",
          message: `Falha ao resolver alvos da regra: ${String(error)}`,
        });
      }
    }

    for (const state of stateRows) {
      const key = buildStateKey(state.rule_id, state.entity_id);
      if (keepStateKeys.has(key)) continue;

      try {
        const result = await revertState(metaToken, state);
        logs.push(result.log);
        if (result.canDelete) {
          stateDeletes.push({ rule_id: state.rule_id, entity_id: state.entity_id });
        }
        if (result.reverted) revertedCount += 1;
        else skippedCount += 1;
      } catch (error) {
        errorCount += 1;
        logs.push({
          rule_id: state.rule_id,
          entity_id: state.entity_id,
          entity_type: state.entity_type,
          action: state.action,
          operation: "error",
          message: `Falha ao reverter estado: ${String(error)}`,
        });
      }
    }

    if (stateUpserts.length > 0) {
      const { error } = await supabase
        .from("campaign_rule_state")
        .upsert(stateUpserts, { onConflict: "rule_id,entity_id" });
      if (error) throw error;
    }

    for (const stateDelete of stateDeletes) {
      const { error } = await supabase
        .from("campaign_rule_state")
        .delete()
        .eq("rule_id", stateDelete.rule_id)
        .eq("entity_id", stateDelete.entity_id);
      if (error) throw error;
    }

    if (logs.length > 0) {
      const { error } = await supabase.from("campaign_rule_log").insert(logs);
      if (error) console.error("campaign_rule_log insert error:", error);
    }

    return new Response(
      JSON.stringify({
        message: "OK",
        rules_checked: enabledRules.length,
        applied: appliedCount,
        reverted: revertedCount,
        skipped: skippedCount,
        errors: errorCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("process-campaign-rules error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
