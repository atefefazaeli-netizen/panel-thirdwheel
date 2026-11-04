# Product gaps (Phase 7), verified by the lead against code at app develop a21451c

| Feature | Evidence | Status | Panel needed? | Work needed |
|---|---|---|---|---|
| Email delivery (sign-in codes, data export links, support inbox) | backend/apps/api/src/infrastructure/outbound/outbound.module.ts: EMAIL_SENDER and SMS_SENDER are always LogEmailSender / LogSmsSender (bodies hidden in production). No provider adapter. | D, P0 release blocker for app and panel sign-in in production (OTP_FIXED_CODE is disabled in production) | No | Infra decision: email provider (SES, Postmark, Resend, SMTP) + adapter + DNS (SPF/DKIM). |
| Occasion planner | Only a plan flag: subscription/domain/plan.ts LimitName 'occasion_planner'; copy in Settings Subscription.tsx. No feature module or screen. | D | Not until the feature exists | Product spec, app screens, backend module. |
| Learnings from quizzes, games, daily question | privacy/listeners/privacy.handlers.ts writes learned facts only from plan.rated, plan.dropped, league.result_logged (plus chat talks/hints per context). No quiz/game/daily-question source. | C | Optional later (view/hide learned facts is already per-user in the app) | Backend listeners on quiz.completed / daily answers with clinician-reviewed rules. |
| Third Ear-drafted daily question (1 day in 3) | src/features/us/Question.tsx:44 TODO(api); nothing in backend us module. | D | Possibly (review of AI-drafted questions) | Product + clinical decision first (AI-written questions reaching couples). |
| Money Talks comfortable spend | src/features/explore/filters.ts:86 TODO(api); ExploreScreen.tsx passes a fixed budget '25-75'. | D | No | Backend field from the Money Talks answers + app wiring. |
| SMS / email reminders | LogSmsSender only; partners invites nudge reaches only accounts (push). | D | No | Depends on the email/SMS provider decision. |
| Real venue booking destinations | booking/services/venue-links.service.ts: no page on file → web search URL; admin can set links (panel Legacy › booking links). | C (mechanism built, no data) | Yes, exists (booking links) | Ops: enter real venue pages; partnership/affiliate decisions. |
| Store receipt verification | subscription/receipts MockReceiptVerifier accepts "mock:<product>:<tx>". No App Store Server API / Play Developer API adapters. | D, P0 before selling Plus | Panel must label (accounts audit) | Apple/Google credentials + adapters + server notifications. |
| Recorder transcription | recorder.service.ts:93 NotImplementedException (501). | D | No | Provider decision (privacy: voice data). |
| Real push delivery | ExpoPushSender exists (PUSH_DRIVER=expo + EXPO_ACCESS_TOKEN); never tested with real devices. | C, untested | No | Real device test with an Expo project. |
| Native iOS / Android | No ios/ or android/ (CNG); only web export was ever run. | F/untested | No | EAS builds and device testing. |
| Runtime Explore panels, legal documents, categories | panels.data.ts, legal/content/*.json, category lists are code. | E (product decision) | Only if decided | If wanted: content-module style versioning with review for legal text. |
