# crm-saas

This workspace contains the standalone CRM SaaS product.

Boundaries:
- All new implementation lives under `crm-saas/frontend` or `crm-saas/backend`.
- The existing TalkTime app at the repository root is reference-only.
- No code, config, assets, migrations, or tests in the TalkTime folders should be modified for this product.

Structure:
- `frontend/`: web application
- `backend/`: API, data layer, and service integrations

Validation rules:
- Any new CRM SaaS file must be created under this folder.
- Frontend concerns stay under `frontend/`.
- Backend concerns stay under `backend/`.
