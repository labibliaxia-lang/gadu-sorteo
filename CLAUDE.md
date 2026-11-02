# sorteos herramientas — agent entry point

Read these before acting. They are short on purpose; detail lives where they point.

## Knowledge map

| What | Where |
|------|-------|
| Project constitution (SDD non-negotiables) | `02-DOCS/wiki/sdd/constitution.md` |
| SDD decisions (append-only) | `02-DOCS/wiki/sdd/decisions.md` |
| Harness: what was installed and why | `02-DOCS/wiki/harness/installation-plan.md` |
| Harness: acceptance and profile facts | `02-DOCS/wiki/harness/decisions.md` |
| How to talk to the owner (register) | `02-DOCS/wiki/harness/user-profile.md` |
| Tool connections (credentials, tested CLIs) | `01-TOOLS/` |
| Product and setup guide | `README.md` |

No `02-DOCS/wiki/index.md` exists yet: the wiki holds only the harness and SDD articles. The
`harness` skill creates the full index when stack articles are added.

## Working rules in one line each

- Every turn takes one lane and says which: answer (read-only) · `ftd` (one feature document) ·
  `sdd` (spec-led, owner approves the spec).
- Done means observed: `npm run typecheck` clean, `npm run lint` clean (0 warnings), `npm test`
  passing, `npm run build` passing, and for money paths a real reservation → payment → `sold` trace
  (constitution principles 6-8).
- Numbers become `sold` only through a payment verified against Mercado Pago's API — never from the
  client, never from a webhook body alone (principle 16).
- The service-role client stays on the server; no default secrets; dev-only routes return 403
  outside development (principles 10, 19-20).
