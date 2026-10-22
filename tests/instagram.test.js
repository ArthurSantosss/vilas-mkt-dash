import test from 'node:test';
import assert from 'node:assert/strict';
import {
  variation, engagementRate, postInteractions, postEngagementRate, postFormat,
  summarizeByFormat, sortPosts, withShare, instagramAgencyKey, filterAccountsByAgency, NO_AGENCY,
} from '../src/shared/utils/instagramMetrics.js';
import { parseFollowBreakdown, valuesToDailySeries } from '../api/_instagram-data.js';

test('variação contra o período anterior', () => {
  assert.equal(variation(150, 100), 50);
  assert.equal(variation(50, 100), -50);
  assert.equal(variation(0, 0), 0);
  assert.equal(variation(10, 0), null);
  assert.equal(variation(null, 100), null);
  assert.equal(variation(100, undefined), null);
});

test('taxa de engajamento = interações ÷ alcance', () => {
  assert.equal(engagementRate(50, 1000), 5);
  assert.equal(engagementRate(50, 0), null);
  assert.equal(engagementRate(null, 1000), null);
});

test('interações do post somam só o que a API devolveu', () => {
  assert.equal(postInteractions({ likes: 10, comments: 2, saves: null, shares: 3 }), 15);
  assert.equal(postInteractions({ likes: null, comments: null, saves: null, shares: null }), null);
  assert.equal(postEngagementRate({ likes: 10, comments: 0, saves: 0, shares: 0, reach: 200 }), 5);
  assert.equal(postEngagementRate({ likes: 10, reach: null }), null);
});

test('formato do post', () => {
  assert.equal(postFormat({ productType: 'REELS', mediaType: 'VIDEO' }), 'reels');
  assert.equal(postFormat({ productType: 'FEED', mediaType: 'CAROUSEL_ALBUM' }), 'carousel');
  assert.equal(postFormat({ productType: 'FEED', mediaType: 'VIDEO' }), 'video');
  assert.equal(postFormat({ productType: 'FEED', mediaType: 'IMAGE' }), 'image');
});

test('resumo por formato recalcula a taxa dos totais e ordena pelo engajamento', () => {
  const posts = [
    { productType: 'REELS', mediaType: 'VIDEO', reach: 1000, likes: 100, comments: 0, saves: 0, shares: 0 },
    { productType: 'REELS', mediaType: 'VIDEO', reach: 3000, likes: 20, comments: 0, saves: 0, shares: 0 },
    { productType: 'FEED', mediaType: 'IMAGE', reach: 100, likes: 10, comments: 0, saves: 0, shares: 0 },
  ];
  const [first, second] = summarizeByFormat(posts);
  assert.equal(first.format, 'image');
  assert.equal(first.engagementRate, 10);
  assert.equal(second.format, 'reels');
  assert.equal(second.count, 2);
  assert.equal(second.avgReach, 2000);
  assert.equal(second.avgInteractions, 60);
  assert.equal(second.engagementRate, 3);
});

test('ordenação dos posts', () => {
  const posts = [
    { id: 'a', timestamp: '2026-10-01T10:00:00+0000', reach: 500, likes: 5 },
    { id: 'b', timestamp: '2026-10-03T10:00:00+0000', reach: 100, likes: 20 },
    { id: 'c', timestamp: '2026-10-02T10:00:00+0000', reach: null, likes: 1 },
  ];
  assert.deepEqual(sortPosts(posts, 'recent').map(p => p.id), ['b', 'c', 'a']);
  assert.deepEqual(sortPosts(posts, 'reach').map(p => p.id), ['a', 'b', 'c']);
  assert.deepEqual(sortPosts(posts, 'engagement').map(p => p.id), ['b', 'a', 'c']);
  assert.deepEqual(posts.map(p => p.id), ['a', 'b', 'c'], 'não altera a lista original');
});

test('parcela de cada item no público', () => {
  assert.deepEqual(withShare([{ label: 'F', value: 30 }, { label: 'M', value: 10 }]).map(i => i.share), [75, 25]);
  assert.deepEqual(withShare([{ label: 'F', value: 0 }]).map(i => i.share), [0]);
});

test('follows_and_unfollows separa entradas e saídas', () => {
  const item = {
    name: 'follows_and_unfollows',
    total_value: { breakdowns: [{ dimension_keys: ['follow_type'], results: [
      { dimension_values: ['FOLLOWER'], value: 42 },
      { dimension_values: ['NON_FOLLOWER'], value: 7 },
    ] }] },
  };
  assert.deepEqual(parseFollowBreakdown(item), { follows: 42, unfollows: 7 });
  assert.deepEqual(parseFollowBreakdown({}), { follows: 0, unfollows: 0 });
});

test('série diária usa o dia anterior ao end_time', () => {
  assert.deepEqual(valuesToDailySeries([
    { value: 120, end_time: '2026-10-11T07:00:00+0000' },
    { value: '80', end_time: '2026-10-12T07:00:00+0000' },
    { value: 5 },
  ]), [{ date: '2026-10-10', value: 120 }, { date: '2026-10-11', value: 80 }]);
});

test('filtro de contas por agência', () => {
  const accounts = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const map = { ig_1: 'Vilas', ig_2: 'Outra', 1: 'Errada' };
  assert.equal(instagramAgencyKey('1'), 'ig_1');
  assert.deepEqual(filterAccountsByAgency(accounts, map, 'all').map(a => a.id), ['1', '2', '3']);
  assert.deepEqual(filterAccountsByAgency(accounts, map, 'Vilas').map(a => a.id), ['1']);
  assert.deepEqual(filterAccountsByAgency(accounts, map, NO_AGENCY).map(a => a.id), ['3']);
  assert.deepEqual(filterAccountsByAgency(accounts, {}, 'Vilas'), []);
});
