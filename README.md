# appfolio-mcp

A remote MCP server for the AppFolio Database API and Reports API.

**Status: design phase.** See [docs/superpowers/specs/2026-08-13-appfolio-mcp-design.md](docs/superpowers/specs/2026-08-13-appfolio-mcp-design.md) for the current design.

## What this is

Gives Agents read access to an AppFolio property-management database (rent rolls, delinquency, work orders, vendor compliance, and the full Database API catalog), plus role-scoped, human-confirmed write access, over a remote MCP connection. Built for and validated against a real property management client (Perpetual Realty).

## Perpetual Realty / PPM engagement

The client-facing workspace for the Perpetual Realty (Perpetual Property Management, "PPM")
engagement — Justin Brown's AppFolio build-out — lives in a separate repo, `ppm-appfolio`
(`~/Developer/ppm-appfolio`; not yet pushed to a remote). Credentials for this client's AppFolio
Database/Reports API are already configured here in `.env.local`; that repo points back here
rather than duplicating them.

## License

MIT — see [LICENSE](LICENSE).
