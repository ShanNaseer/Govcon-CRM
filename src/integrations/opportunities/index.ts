import type { OpportunityProvider } from "@/integrations/opportunities/provider.types";
import type { OpportunitySourceType } from "@/generated/prisma/enums";
import { higherGovProvider } from "@/integrations/opportunities/highergov/highergov.provider";

/**
 * Provider registry.
 *
 * Connectors register here so callers resolve a provider by source rather than
 * importing a specific integration — nothing outside `src/integrations/` should
 * ever name a concrete provider module.
 *
 * HigherGov is registered below. It is an aggregator rather than a single source —
 * one endpoint carries SAM.gov, DIBBS, SBIR, grants and state/local records, and the
 * normalizer stamps each with its own upstream system. That does not fit this
 * registry's one-connector-one-source key, so the sync service imports the connector
 * directly and the registry entry exists for discovery only. See the note in
 * highergov.provider.ts.
 */

const providers = new Map<OpportunitySourceType, OpportunityProvider>();

registerProvider(higherGovProvider);

export function registerProvider(provider: OpportunityProvider): void {
  providers.set(provider.source, provider);
}

export function getProvider(source: OpportunitySourceType): OpportunityProvider | undefined {
  return providers.get(source);
}

export function listRegisteredProviders(): OpportunityProvider[] {
  return Array.from(providers.values());
}

export type { OpportunityProvider } from "@/integrations/opportunities/provider.types";
export type {
  FetchOpportunitiesParams,
  FetchOpportunitiesResult,
  NormalizedOpportunity,
} from "@/integrations/opportunities/provider.types";
