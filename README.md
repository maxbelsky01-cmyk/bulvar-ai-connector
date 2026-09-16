# Bulvar AI Connector
Read-only starter connector between amoCRM and an AI analytics layer.

## Railway variables
- AMO_BASE_URL — e.g. https://youraccount.amocrm.ru
- AMO_CLIENT_ID
- AMO_CLIENT_SECRET
- AMO_REDIRECT_URI — https://YOUR-DOMAIN/oauth/callback
- CONNECTOR_API_KEY — long random secret for /api/*

Optional bootstrap variables: AMO_ACCESS_TOKEN, AMO_REFRESH_TOKEN.

## Endpoints
- GET /health
- GET /oauth/callback
- GET /api/account
- GET /api/users
- GET /api/pipelines
- GET /api/tasks
- GET /api/leads
- GET /api/analysis

/api/* requires `Authorization: Bearer <CONNECTOR_API_KEY>`.

## Important
This starter only performs GET requests against amoCRM business-data endpoints. OAuth token exchange/refresh necessarily uses POST. Tokens are currently kept in process memory; before production use, add persistent encrypted token storage (e.g. Railway Postgres) so refresh tokens survive restarts.
