# Specs — D2C CS/VOC AX Ops Hub

Authoritative technical specifications. These documents define contracts, entities, and feature requirements that implementation must match.

---

## System

| Document | Purpose |
|----------|---------|
| [Architecture](architecture.md) | Component diagram, data flow, DB tables, integrations |

## Domain

| Document | Purpose |
|----------|---------|
| [Domain Entities](domain/domain-entities.md) | CsTicket, AutomationRun, KnowledgeDoc field schemas |
| [Entity Mapping](domain/entity-mapping.md) | DB column ↔ TypeScript type mapping |
| [Routing Rules](domain/routing-rules.md) | 20+ intent classification rules |
| [Run Types](domain/run-types.md) | AutomationRun run_type enum definitions |
| [VOC Taxonomy](domain/voc-taxonomy.md) | VOC category hierarchy |

## API

| Document | Purpose |
|----------|---------|
| [Admin API](api/admin-api.md) | Dashboard read-only endpoints |
| [Commerce API](api/commerce-api.md) | Mock commerce fixture endpoints |

## Contracts (Behavioral)

| Document | Purpose |
|----------|---------|
| [Automation Run](contracts/automation-run.md) | Pipeline step recording contract |
| [Case State](contracts/case-state.md) | Case lifecycle state machine |
| [Connection Health](contracts/connection-health.md) | Service health check spec |
| [Dashboard Pages](contracts/dashboard-pages.md) | Dashboard tab content contracts |
| [Decision Router](contracts/decision-router.md) | Routing decision output contract |
| [Evidence Packet](contracts/evidence-packet.md) | Evidence retrieval output shape |
| [Failure Modes](contracts/failure-modes.md) | Known failure paths and recovery |
| [Fixture Policy](contracts/fixture-policy.md) | Commerce API fixture data rules |
| [Human Review Action Tree](contracts/human-review-action-tree.md) | Slack button → action mapping |
| [Improvement Loop](contracts/improvement-loop.md) | VOC → backlog → knowledge cycle |
| [Knowledge Control Plane](contracts/knowledge-control-plane.md) | Knowledge index sync spec |
| [Knowledge Search](contracts/knowledge-search.md) | Search query + result contract |
| [Notion Write](contracts/notion-write.md) | Notion API write contract |
| [OpenClaw CS Bot](contracts/openclaw-cs-bot.md) | LLM draft generation contract |
| [Prompt Version](contracts/prompt-version.md) | Prompt versioning contract |
| [Slack Actions](contracts/slack-actions.md) | Block Kit interactive actions |
| [Slack Archive](contracts/slack-archive.md) | #voc-log archive format |
| [Slack Review Card](contracts/slack-review-card.md) | Review card Block Kit spec |
| [Testing Strategy](contracts/testing-strategy.md) | QA approach and test tiers |
| [VOC Classifier](contracts/voc-classifier.md) | Classifier behavior contract |
| [VOC Report](contracts/voc-report.md) | Report generation contract |

## Features (PRDs)

| Document | Phase | Purpose |
|----------|-------|---------|
| [Phase 0](features/phase-0-prd.md) | Foundation | Setup, contracts, connectors |
| [Phase 1](features/phase-1-prd.md) | Commerce API | Mock commerce API + fixture data |
| [Phase 2](features/phase-2-prd.md) | VOC Generator | Inbound CS message intake |
| [Phase 3](features/phase-3-prd.md) | Decision Router | Intent classification + routing |
| [Phase 4](features/phase-4-prd.md) | Human Review | Slack Block Kit review flow |
| [Phase 5](features/phase-5-prd.md) | Automation Run | Pipeline step recording |
| [Phase 6](features/phase-6-prd.md) | Dashboard | React admin dashboard |
| [Phase 7](features/phase-7-prd.md) | Knowledge | Notion sync + knowledge search |
| [Phase 8](features/phase-8-prd.md) | VOC Report | Recurring issues + improvement suggestions |
