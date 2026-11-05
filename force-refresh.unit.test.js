/* globals describe, it, expect, jest */
jest.mock('./resolvers/product', () => ({
  translateProduct: jest.fn(async ({ rootValue }) => ({
    productId: rootValue.id,
    productName: rootValue.name,
  })),
}));

const Plugin = require('./index');

describe('searchProducts force refresh payload', () => {
  const search = (data, payload) => new Plugin({}).searchProducts({
    axios: async () => ({ data }),
    token: { endpoint: 'https://bonza.example', apiKey: 'key' },
    typeDefsAndQueries: {},
    payload,
  });

  it.each([{}, null, { error: 'unavailable' }])('rejects a malformed catalog %p', async data => {
    await expect(search(data)).rejects.toThrow('array');
  });

  it('rejects missing identifiers and deduplicates stable identifiers', async () => {
    await expect(search([{ name: 'invalid' }])).rejects.toThrow('id');
    expect((await search([{ id: 1 }, { id: '1' }, { id: ' 1 ' }, { id: 2 }])).products)
      .toEqual([{ productId: 1 }, { productId: 2 }]);
    expect((await search([])).products).toEqual([]);
  });
  it.each([
    [{ id: ' 1 ', name: 'First Tour' }],
    [{ id: ' 1 ', name: 'First Tour' }, { id: '1', name: 'Duplicate Tour' }],
  ])('normalizes padded string ids before translation: %p', async (...rows) => {
    expect((await search(rows)).products)
      .toEqual([{ productId: '1', productName: 'First Tour' }]);
  });

  it.each([null, {}, { id: '' }, { id: '  ' }, { id: NaN }, { id: Infinity }])(
    'rejects the entire catalog when a row has an invalid id: %p', async row => {
      await expect(search([{ id: '1' }, row])).rejects.toThrow('id');
    },
  );

  it.each([
    'forceRefresh', 'requestId', 'backgroundJob', 'cacheOnly',
    'fullSyncTrigger', 'admissionOverrideReason', 'fullSyncStartedAt',
    'fullSyncAdmissionToken', 'omitServiceCodes', 'pickupPointsRequired',
    'credentials', 'scheduledProductSyncEnabled',
  ])('keeps the full catalog with string-valued Ti2 metadata: %s', async key => {
    const result = await search([{ id: '1', name: 'Sydney Classic Tour' }], {
      [key]: 'internal-metadata',
    });
    expect(result.products).toEqual([
      { productId: '1', productName: 'Sydney Classic Tour' },
    ]);
  });

  it('wraps a single-product response when searching by productId', async () => {
    const result = await search({ id: '1', name: 'Sydney Classic Tour' }, { productId: '1' });
    expect(result.products).toEqual([{ productId: '1', productName: 'Sydney Classic Tour' }]);
  });

  it('still applies product filters alongside refresh metadata', async () => {
    const result = await search([
      { id: '1', name: 'Sydney Classic Tour' },
      { id: '2', name: 'Other Tour' },
    ], { productName: 'Sydney*', requestId: 'worker-job-id', forceRefresh: true });
    expect(result.products).toEqual([{ productId: '1', productName: 'Sydney Classic Tour' }]);
  });
});
