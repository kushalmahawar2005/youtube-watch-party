import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YouTubeService, parseIsoDuration } from '../src/services/YouTubeService.js';

/** Fake fetch that answers like the YouTube Data API and counts calls per endpoint. */
function fakeYouTube() {
  const calls = { search: 0, videos: 0 };
  const video = (id, embeddable = true) => ({
    id,
    snippet: { title: `Video ${id}`, channelTitle: 'Channel', thumbnails: { medium: { url: `thumb-${id}` } } },
    contentDetails: { duration: 'PT3M5S' },
    statistics: { viewCount: '42' },
    status: { embeddable },
  });
  const fetchImpl = async (url) => {
    const endpoint = url.pathname.split('/').pop();
    calls[endpoint] += 1;
    if (endpoint === 'search') {
      return Response.json({ items: [{ id: { videoId: 'aaaaaaaaaaa' } }, { id: { videoId: 'bbbbbbbbbbb' } }] });
    }
    const ids = url.searchParams.get('id').split(',');
    return Response.json({ items: ids.map((id) => video(id, id !== 'bbbbbbbbbbb')) });
  };
  return { calls, fetchImpl };
}

test('parses ISO 8601 durations', () => {
  assert.equal(parseIsoDuration('PT1H2M10S'), 3730);
  assert.equal(parseIsoDuration('PT45S'), 45);
  assert.equal(parseIsoDuration('P0D'), 0);
});

test('search returns only embeddable videos with details, and is cached', async () => {
  const { calls, fetchImpl } = fakeYouTube();
  const yt = new YouTubeService('key', fetchImpl);

  const results = await yt.search('lofi');
  assert.deepEqual(results.map((v) => v.id), ['aaaaaaaaaaa']);
  assert.equal(results[0].duration, 185);
  assert.equal(results[0].thumbnail, 'thumb-aaaaaaaaaaa');

  await yt.search('LOFI ');
  assert.deepEqual(calls, { search: 1, videos: 1 });
});

test('getVideos only fetches ids that are not cached', async () => {
  const { calls, fetchImpl } = fakeYouTube();
  const yt = new YouTubeService('key', fetchImpl);

  await yt.getVideos(['aaaaaaaaaaa']);
  const videos = await yt.getVideos(['aaaaaaaaaaa', 'ccccccccccc', 'not-an-id']);
  assert.deepEqual(videos.map((v) => v.id), ['aaaaaaaaaaa', 'ccccccccccc']);
  assert.equal(calls.videos, 2);
});

test('without an API key the service is disabled', async () => {
  const yt = new YouTubeService('');
  assert.equal(yt.enabled, false);
  await assert.rejects(yt.search('x'), { status: 503 });
});
