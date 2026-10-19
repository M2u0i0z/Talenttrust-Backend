import request from 'supertest';
import { createApp } from '../src/app';
import { canonicalJSON, EscrowStore, termsHash } from '../src/store';

const VECTOR = {
  client: 'GCLIENT',
  freelancer: 'GFREELANCER',
  token: 'XLM',
  milestones: [
    { title: 'Design', amount: 100 },
    { title: 'Build', amount: 250 },
  ],
};

const VECTOR_HASH = '506bb82832289e652825e2e7e72c944300e1e795e789a7a270b1ad91011327be';

describe('deterministic contract terms hash', () => {
  it('canonicalizes object keys and preserves array order', () => {
    expect(canonicalJSON({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });

  it('matches the fixed test vector', () => {
    expect(termsHash(VECTOR)).toBe(VECTOR_HASH);
  });
});

describe('freelancer acceptance', () => {
  let app: ReturnType<typeof createApp>;
  let store: EscrowStore;

  beforeEach(() => {
    store = new EscrowStore();
    app = createApp(store);
  });

  const createContract = async (overrides: Record<string, unknown> = {}) => {
    const res = await request(app)
      .post('/api/v1/contracts')
      .send({ ...VECTOR, ...overrides });
    expect(res.status).toBe(201);
    return res.body;
  };

  const accept = (contract: any, body: Record<string, unknown> = {}) =>
    request(app)
      .post(`/api/v1/contracts/${contract.id}/accept`)
      .send({ freelancer: contract.freelancer, termsHash: contract.acceptance.termsHash, ...body });

  it('starts pending with the canonical terms hash', async () => {
    const contract = await createContract();
    expect(contract.acceptance).toEqual({
      status: 'pending',
      termsHash: VECTOR_HASH,
      respondedAt: null,
    });
  });

  it('blocks deposits while acceptance is pending', async () => {
    const contract = await createContract();
    const res = await request(app).post(`/api/v1/contracts/${contract.id}/deposit`).send({ amount: 100 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('awaiting_acceptance');
    const after = await request(app).get(`/api/v1/contracts/${contract.id}`);
    expect(after.body.fundedAmount).toBe(0);
  });

  it('rejects acceptance by anyone other than the freelancer', async () => {
    const contract = await createContract();
    const res = await accept(contract, { freelancer: 'GSOMEONEELSE' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect((await request(app).get(`/api/v1/contracts/${contract.id}`)).body.acceptance.status).toBe('pending');
  });

  it('rejects a mismatched terms hash', async () => {
    const contract = await createContract();
    const res = await accept(contract, { termsHash: 'deadbeef' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('terms_mismatch');
    expect((await request(app).get(`/api/v1/contracts/${contract.id}`)).body.acceptance.status).toBe('pending');
  });

  it('accepts once and rejects a second response', async () => {
    const contract = await createContract();
    const ok = await accept(contract);
    expect(ok.status).toBe(200);
    expect(ok.body.acceptance.status).toBe('accepted');
    expect(ok.body.acceptance.respondedAt).toEqual(expect.any(String));

    const again = await accept(contract);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('already_responded');
  });

  it('declines with a reason and cancels the contract', async () => {
    const contract = await createContract();
    const res = await request(app)
      .post(`/api/v1/contracts/${contract.id}/decline`)
      .send({ freelancer: contract.freelancer, reason: 'Scope is unclear' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Cancelled');
    expect(res.body.acceptance.status).toBe('declined');
    expect(res.body.acceptance.reason).toBe('Scope is unclear');
  });

  it('rejects decline by a non-freelancer and overlong reasons', async () => {
    const contract = await createContract();
    const forbidden = await request(app)
      .post(`/api/v1/contracts/${contract.id}/decline`)
      .send({ freelancer: 'GSOMEONEELSE' });
    expect(forbidden.status).toBe(403);

    const long = await request(app)
      .post(`/api/v1/contracts/${contract.id}/decline`)
      .send({ freelancer: contract.freelancer, reason: 'x'.repeat(501) });
    expect(long.status).toBe(400);
    expect(long.body.error).toBe('invalid_reason');
  });

  it('does not allow declining after accepting', async () => {
    const contract = await createContract();
    await accept(contract).expect(200);
    const res = await request(app)
      .post(`/api/v1/contracts/${contract.id}/decline`)
      .send({ freelancer: contract.freelancer });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_responded');
  });

  it('allows the client to cancel while acceptance is pending', async () => {
    const contract = await createContract();
    const res = await request(app).post(`/api/v1/contracts/${contract.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Cancelled');
  });

  it('filters by acceptance status and party', async () => {
    const a = await createContract({ client: 'GAC', freelancer: 'GAF' });
    const b = await createContract({ client: 'GBC', freelancer: 'GBF' });
    await accept(a).expect(200);

    const acceptedForA = await request(app)
      .get('/api/v1/contracts')
      .query({ acceptance: 'accepted', party: a.freelancer });
    expect(acceptedForA.body.data.map((c: { id: number }) => c.id)).toEqual([a.id]);

    const pendingForA = await request(app)
      .get('/api/v1/contracts')
      .query({ acceptance: 'pending', party: a.freelancer });
    expect(pendingForA.body.data).toEqual([]);

    const pendingForB = await request(app)
      .get('/api/v1/contracts')
      .query({ acceptance: 'pending', party: b.freelancer });
    expect(pendingForB.body.data.map((c: { id: number }) => c.id)).toEqual([b.id]);
  });

  it('can bypass acceptance when REQUIRE_ACCEPTANCE is disabled', async () => {
    const permissive = createApp(new EscrowStore({ requireAcceptance: false }));
    const created = await request(permissive)
      .post('/api/v1/contracts')
      .send(VECTOR);
    expect(created.status).toBe(201);
    expect(created.body.acceptance.status).toBe('accepted');
    expect(created.body.acceptance.respondedAt).toEqual(expect.any(String));

    const deposit = await request(permissive)
      .post(`/api/v1/contracts/${created.body.id}/deposit`)
      .send({ amount: 100 });
    expect(deposit.status).toBe(200);
  });
});
