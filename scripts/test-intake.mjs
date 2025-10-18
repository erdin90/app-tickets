// Minimal local test for the intake route
// Usage: set INTAKE_ENDPOINT and INTAKE_SECRET in your environment, then run:
//   pnpm intake:test

import assert from 'node:assert';

const endpoint = process.env.INTAKE_ENDPOINT;
const secret = process.env.INTAKE_SECRET;

assert(endpoint, 'INTAKE_ENDPOINT is required');
assert(secret, 'INTAKE_SECRET is required');

const payload = {
  title: 'Test ticket from script',
  content: 'Body content from local test',
  requester_email: 'tester@example.com',
  requester_name: 'Local Tester',
  business_key: 'TEST',
  received_at: new Date().toISOString(),
  message_id: `local-${Date.now()}`,
};

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Intake-Secret': secret,
  },
  body: JSON.stringify(payload),
});

const text = await res.text();
console.log('Status:', res.status);
console.log('Body  :', text);

if (!res.ok) {
  process.exitCode = 1;
}
