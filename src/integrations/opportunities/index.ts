import type { OpportunityProvider } from "@/integrations/opportunities/provider.types";
import type { OpportunitySourceType } from "@/generated/prisma/enums";

/**
 * Provider registry.
 *
 * Connectors register here so callers resolve a provider by source rather than
 * importing a specific integration — nothing outside `src/integrations/` should
 * ever name a concrete provider module.
 *
 * The registry is intentionally empty: no government source is integrated in this
 * release. Registering the SAM.gov connector is the first step of Phase 2.
 */

const providers = new Map<OpportunitySourceType, OpportunityProvider>();

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
