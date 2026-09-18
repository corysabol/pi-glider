# General methodology tips

Operator-editable heuristics that supplement the pi-glider operating manual. Follow these in
addition to the methodology in the `pi-glider` skill.

- **Map the real API surface, not just client routes.** On web apps (especially SPAs), the frontend
  routes are only the UI. Extract backend API routes from JS bundles, and probe for API specs and
  endpoints first: `/swagger`, `/swagger-ui`, `/openapi.json`, `/v3/api-docs`, `/api-docs`,
  GraphQL (`/graphql` + introspection), and common API prefixes. The attack surface is the backend
  API, not the client router.
- **Check for exposed artifacts early.** `.git/`, backup files (`*.bak`, `*.old`, `*.orig`),
  debug/status endpoints, and verbose error pages often leak structure cheaply and inform the rest
  of the recon.
- **Reconcile every new host/IP against RoE scope before actively testing it.** Recon-discovered
  targets are candidates, not automatically in scope.
