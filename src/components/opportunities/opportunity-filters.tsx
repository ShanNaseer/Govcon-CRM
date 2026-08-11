import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { ListOpportunitiesQuery } from "@/features/opportunities/opportunity.schemas";
import { OpportunitySourceType, OpportunityStatus } from "@/generated/prisma/enums";
import { humanizeEnum } from "@/lib/utils";

/**
 * Filter bar for the opportunities list. A GET form, so filter state lives in the
 * URL and the page stays a Server Component.
 */
export function OpportunityFilters({ query }: { query: ListOpportunitiesQuery }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <label htmlFor="opportunity-search" className="sr-only">
          Search opportunities
        </label>
        <Input
          id="opportunity-search"
          type="search"
          name="search"
          defaultValue={query.search ?? ""}
          placeholder="Search title, solicitation number or agency…"
          icon={<Search className="h-4 w-4" aria-hidden />}
        />
      </div>

      <div>
        <label htmlFor="filter-source" className="sr-only">
          Source
        </label>
        <Select id="filter-source" name="source" defaultValue={query.source ?? ""} className="w-36">
          <option value="">All sources</option>
          {Object.values(OpportunitySourceType).map((value) => (
            <option key={value} value={value}>
              {humanizeEnum(value)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label htmlFor="filter-agency" className="sr-only">
          Agency
        </label>
        <Input
          id="filter-agency"
          name="agency"
          defaultValue={query.agency ?? ""}
          placeholder="Agency"
          className="w-40"
        />
      </div>

      <div>
        <label htmlFor="filter-naics" className="sr-only">
          NAICS
        </label>
        <Input
          id="filter-naics"
          name="naicsCode"
          inputMode="numeric"
          defaultValue={query.naicsCode ?? ""}
          placeholder="NAICS"
          className="w-28"
        />
      </div>

      <div>
        <label htmlFor="filter-score" className="sr-only">
          Minimum match score
        </label>
        <Select
          id="filter-score"
          name="minMatchScore"
          defaultValue={query.minMatchScore?.toString() ?? ""}
          className="w-36"
        >
          <option value="">Any score</option>
          <option value="75">Score ≥ 75</option>
          <option value="50">Score ≥ 50</option>
          <option value="25">Score ≥ 25</option>
        </Select>
      </div>

      <div>
        <label htmlFor="filter-deadline" className="sr-only">
          Deadline
        </label>
        <Select
          id="filter-deadline"
          name="deadlineWithinDays"
          defaultValue={query.deadlineWithinDays?.toString() ?? ""}
          className="w-36"
        >
          <option value="">Any deadline</option>
          <option value="7">Next 7 days</option>
          <option value="14">Next 14 days</option>
          <option value="30">Next 30 days</option>
        </Select>
      </div>

      <div>
        <label htmlFor="filter-status" className="sr-only">
          Status
        </label>
        <Select id="filter-status" name="status" defaultValue={query.status ?? ""} className="w-40">
          <option value="">All statuses</option>
          {Object.values(OpportunityStatus).map((value) => (
            <option key={value} value={value}>
              {humanizeEnum(value)}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" variant="secondary">
        Apply
      </Button>
    </form>
  );
}
