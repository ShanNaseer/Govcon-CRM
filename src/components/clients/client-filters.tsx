import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ClientStatus } from "@/generated/prisma/enums";
import { humanizeEnum } from "@/lib/utils";

/**
 * Search and status filters for the clients list.
 *
 * A plain GET form, which keeps this a Server Component and makes the filter
 * state live in the URL — shareable, bookmarkable, and functional without JS.
 */
export function ClientFilters({ search, status }: { search?: string; status?: string }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <label htmlFor="client-search" className="sr-only">
          Search clients
        </label>
        <Input
          id="client-search"
          type="search"
          name="search"
          defaultValue={search ?? ""}
          placeholder="Search by name, industry, CAGE or UEI…"
          icon={<Search className="h-4 w-4" aria-hidden />}
        />
      </div>

      <div>
        <label htmlFor="client-status" className="sr-only">
          Status
        </label>
        <Select id="client-status" name="status" defaultValue={status ?? ""} className="w-40">
          <option value="">All statuses</option>
          {Object.values(ClientStatus).map((value) => (
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
