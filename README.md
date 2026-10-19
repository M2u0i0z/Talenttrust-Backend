# TalentTrust Backend

## Live

- Website: https://talenttrust-frontend.vercel.app
- Docs: https://talenttrust-frontend.vercel.app/docs
- API: https://talenttrust-backend.vercel.app
- API docs (Swagger UI): https://talenttrust-backend.vercel.app/docs
- Contract (Stellar testnet): [`CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W`](https://stellar.expert/explorer/testnet/contract/CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W)

Express + TypeScript API for TalentTrust, a milestone-based freelancer escrow protocol on Stellar.
The API mirrors the state machine of the Soroban escrow contract
([Talenttrust-Contracts](https://github.com/Talenttrust/Talenttrust-Contracts)) so clients and
freelancers can create engagements, fund escrow, release milestones, raise disputes and build reputation.

Storage is in-memory (seeded with demo data), so no database is required. On serverless hosting the
data is per-instance and resets on redeploy.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Service info and endpoint list (JSON) |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |
| GET | `/openapi.json` | OpenAPI 3 spec |
| GET | `/api/v1/chain` | On-chain contract deployment info |
| GET | `/api/v1/stats` | Aggregate statistics |
| GET/POST | `/api/v1/contracts` | List (`?status=`, `?acceptance=`, `?party=`) / create escrow contracts |
| GET | `/api/v1/contracts/:id` | Get a contract |
| POST | `/api/v1/contracts/:id/accept` | `{ "freelancer": "G...", "termsHash": "..." }` |
| POST | `/api/v1/contracts/:id/decline` | `{ "freelancer": "G...", "reason": "..." }` (reason ≤ 500 chars) |
| POST | `/api/v1/contracts/:id/deposit` | `{ "amount": 100 }` (requires acceptance) |
| POST | `/api/v1/contracts/:id/milestones/:index/release` | Release a milestone |
| POST | `/api/v1/contracts/:id/dispute` | `{ "raisedBy": "G...", "reason": "..." }` |
| POST | `/api/v1/contracts/:id/resolve` | `{ "freelancerBps": 5000 }` |
| POST | `/api/v1/contracts/:id/cancel` | Cancel and refund |
| POST | `/api/v1/contracts/:id/reputation` | `{ "rating": 5 }` |
| GET | `/api/v1/reputation/:address` | Freelancer reputation |

## Development

```bash
npm ci
npm run dev      # http://localhost:3001
npm run lint     # type check
npm test
npm run build && npm start
```

### Acceptance

New contracts start with `acceptance.status: "pending"` and a deterministic `termsHash`
(SHA-256 of canonical JSON containing the client, freelancer, token and milestone terms).
The freelancer must call `/accept` with the matching hash before the client can fund escrow;
`/deposit` returns `409 awaiting_acceptance` until then. The freelancer may instead `/decline`
(with an optional reason of at most 500 characters), which cancels the contract. The client can
also cancel while acceptance is pending. Set `REQUIRE_ACCEPTANCE=false` to let new contracts
start accepted for trusted/back-office flows.

Configuration (all optional, see `.env.example`):

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port when running directly |
| `ESCROW_CONTRACT_ID` | testnet contract | Soroban escrow contract ID |
| `STELLAR_NETWORK` | `testnet` | Stellar network name |
| `STELLAR_RPC_URL` | Soroban testnet RPC | Stellar RPC endpoint |
| `FRONTEND_URL` | TalentTrust frontend | Website link shown in service info |
| `REQUIRE_ACCEPTANCE` | `true` | Require freelancer acceptance before funding |

## Deployment

Deployed on Vercel as a serverless function: `api/index.ts` exports the Express app and
`vercel.json` rewrites every path to it. `src/index.ts` only calls `listen()` when run directly.

```bash
vercel deploy --prod
```

## License

MIT
