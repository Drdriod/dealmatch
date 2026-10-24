import test from 'node:test';
import assert from 'node:assert/strict';
import { nextActionFor, canReportProblem, roleFor } from './transactionStates.js';
import { formatKobo } from './money.js';

test('customer who has not confirmed gets the confirm action', () => {
  const a = nextActionFor({ state: 'in_progress', role: 'customer', buyerConfirmed: false, providerConfirmed: false });
  assert.equal(a.id, 'confirm_completion');
});

test('a party who already confirmed only waits', () => {
  const a = nextActionFor({ state: 'awaiting_completion', role: 'provider', buyerConfirmed: false, providerConfirmed: true });
  assert.equal(a.id, 'wait');
  assert.equal(a.label, null);
});

test('admin and viewers get no confirm action', () => {
  assert.equal(nextActionFor({ state: 'in_progress', role: 'admin' }), null);
});

test('problems can only be reported on funded, unfinished work', () => {
  assert.equal(canReportProblem('in_progress', 'customer'), true);
  assert.equal(canReportProblem('completed', 'customer'), false);
  assert.equal(canReportProblem('in_progress', 'viewer'), false);
});

test('role resolution', () => {
  const tx = { buyer_id: 'a', provider_id: 'b' };
  assert.equal(roleFor(tx, 'a', false), 'customer');
  assert.equal(roleFor(tx, 'b', false), 'provider');
  assert.equal(roleFor(tx, 'z', true), 'admin');
  assert.equal(roleFor(tx, 'z', false), 'viewer');
});

test('kobo formatting', () => {
  assert.ok(formatKobo(150000).includes('1,500'));
  assert.equal(formatKobo('x'), '');
});
