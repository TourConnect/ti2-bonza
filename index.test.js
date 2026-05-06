/* globals describe, beforeAll, it, expect */
const R = require('ramda');
const axios = require('axios');
const moment = require('moment');
const faker = require('faker');
const jwt = require('jsonwebtoken');

const Plugin = require('./index');

const { typeDefs: productTypeDefs, query: productQuery } = require('./node_modules/ti2/controllers/graphql-schemas/product');
const { typeDefs: availTypeDefs, query: availQuery } = require('./node_modules/ti2/controllers/graphql-schemas/availability');
const { typeDefs: bookingTypeDefs, query: bookingQuery } = require('./node_modules/ti2/controllers/graphql-schemas/booking');
const { typeDefs: rateTypeDefs, query: rateQuery } = require('./node_modules/ti2/controllers/graphql-schemas/rate');
const { typeDefs: pickupTypeDefs, query: pickupQuery } = require('./node_modules/ti2/controllers/graphql-schemas/pickup-point');

const typeDefsAndQueries = {
  productTypeDefs,
  productQuery,
  availTypeDefs,
  availQuery,
  bookingTypeDefs,
  bookingQuery,
  rateTypeDefs,
  rateQuery,
  pickupQuery,
  pickupTypeDefs,
};

const app = new Plugin({
  jwtKey: process.env.ti2_bonza_jwtKey,
});
const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
const runBonzaIntegrationTests = process.env.RUN_BONZA_INTEGRATION_TESTS === 'true';
const describeIfBonzaIntegration = runBonzaIntegrationTests ? describe : describe.skip;

describe('search tests', () => {
  // let products;
  let testProduct = {
    productId: '11',
    productName: 'Sydney Classic Tour',
  };
  const token = {
    endpoint: process.env.ti2_bonza_endpoint,
    apiKey: process.env.ti2_bonza_apiKey,
    bookingPartnerId: 181,
  };
  const dateFormat = 'DD/MM/YYYY';
  const dateFormatCB = 'YYYY-MM-DD';
  beforeAll(async () => {
    // nada
  });
  describe('utilities', () => {
    describeIfBonzaIntegration('validateToken', () => {
      it('valid token', async () => {
        expect(token).toBeTruthy();
        const retVal = await app.validateToken({
          axios,
          token,
        });
        expect(retVal).toBeTruthy();
      });
      it('invalid token', async () => {
        const retVal = await app.validateToken({
          axios,
          token: { apiKey: 'invalid token' },
        });
        expect(retVal).toBeFalsy();
      });
    });
    describe('template tests', () => {
      let template;
      it('get the template', async () => {
        template = await app.tokenTemplate();
        const rules = Object.keys(template);
        expect(rules).toContain('endpoint');
        expect(rules).toContain('apiKey');
        expect(rules).toContain('bookingPartnerId');
      });
      it('endpoint', () => {
        const endpoint = template.endpoint.regExp;
        const validEndpoint = token.endpoint || 'https://bmsstage.bonzabiketours.com:3001/octo/v1';
        expect(endpoint.test('something')).toBeFalsy();
        expect(endpoint.test(validEndpoint)).toBeTruthy();
      });
      it('apiKey', () => {
        const apiKey = template.apiKey.regExp;
        const validApiKey = token.apiKey || '0123456789abcdef0123456789abcdef0123456789abcdef';
        expect(apiKey.test('asfsdf something')).toBeFalsy();
        expect(apiKey.test(validApiKey)).toBeTruthy();
      });
      it('bookingPartnerId', () => {
        const bookingPartnerId = template.bookingPartnerId.regExp;
        expect(bookingPartnerId.test('something')).toBeFalsy();
        expect(bookingPartnerId.test(token.bookingPartnerId)).toBeTruthy();
      });
    });
  });
  describe('booking payload mapping', () => {
    it('should return mandatory create booking fields with per-booking flags', async () => {
      const retVal = await app.getCreateBookingFields({
        axios,
        token,
        query: {
          productId: '11',
          unitsSelected: JSON.stringify([{ unitId: 'ADULT', quantity: 1 }]),
          date: moment().format(dateFormat),
          dateFormat,
        },
      });
      expect(Array.isArray(retVal.fields)).toBeTruthy();
      expect(retVal.fields).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'reference',
          required: true,
          visiblePerBooking: true,
          requiredPerBooking: true,
        }),
        expect.objectContaining({ id: 'firstName', required: true }),
        expect.objectContaining({ id: 'lastName', required: true }),
        expect.objectContaining({ id: 'emailAddress', required: true }),
        expect.objectContaining({ id: 'phoneNumber', required: true }),
      ]));
    });

    it('should parse new customFieldValues structure in createBooking', async () => {
      const localApp = new Plugin({ jwtKey: 'unit-test-jwt-key' });
      let createBookingPayload;
      let confirmBookingPayload;
      const axiosMock = jest.fn(async config => {
        if (config.method === 'post' && config.url.endsWith('/bookings')) {
          createBookingPayload = config.data;
          return { data: { orderUUID: 'order-1' } };
        }
        if (config.method === 'post' && config.url.endsWith('/bookings/order-1/confirm')) {
          confirmBookingPayload = config.data;
          return { data: { id: 'booking-1' } };
        }
        if (config.method === 'get' && config.url.endsWith('/bookings/booking-1')) {
          return {
            data: {
              id: 'booking-1',
              uuid: 'BOOK-REF-1',
              bookingRefID: 'BOOK-REF-1',
              status: 'CONFIRMED',
              product: { id: '11', internalName: 'Sydney Classic Tour' },
              travelerFirstname: 'Test',
              travelerLastname: 'User',
              email: 'test@example.com',
              phone: '888888877',
              totalNet: 100,
            },
          };
        }
        throw new Error(`Unexpected axios call: ${config.method} ${config.url}`);
      });

      const availabilityKey = jwt.sign({
        productId: '11',
        optionId: '2',
        tourDate: moment().add(14, 'days').format(dateFormatCB),
        unitItems: [
          { unitId: 'ADULT', noOfPax: '2' },
        ],
      }, 'unit-test-jwt-key');

      const retVal = await localApp.createBooking({
        axios: axiosMock,
        token: {
          endpoint: 'https://bmsstage.bonzabiketours.com:3001/octo/v1',
          apiKey: 'api-key',
          bookingPartnerId: 181,
        },
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          holder: {
            name: 'Test',
            surname: 'User',
            emailAddress: 'test@example.com',
            phone: '888888877',
          },
          reference: 'BOOK-REF-1',
          customFieldValues: [
            { field: { id: 7, type: 'extended-option', isPerUnitItem: false }, value: { value: 146, label: 'Netherlands', userInput: true } },
            { field: { id: 8, type: 'short', isPerUnitItem: false }, value: 'TEST' },
            { field: { id: 9, type: 'yes-no', isPerUnitItem: false }, value: 'no' },
            { field: { id: 10, type: 'yes-no', isPerUnitItem: false }, value: 'yes' },
            { field: { id: 11, type: 'yes-no', isPerUnitItem: false }, value: 'yes' },
            { field: { id: 1, type: 'count', isPerUnitItem: false }, value: '1' },
          ],
        },
      });

      expect(createBookingPayload.originCountry).toBe('Netherlands');
      expect(createBookingPayload.travelAgency).toBe('TEST');
      expect(createBookingPayload.famils).toBe(0);
      expect(confirmBookingPayload.sendEmailToPartner).toBe(1);
      expect(confirmBookingPayload.sendEmailToGuest).toBe(1);
      expect(retVal.booking).toBeTruthy();
      expect(retVal.booking.supplierBookingId).toBe('BOOK-REF-1');
    });
  });
  describeIfBonzaIntegration('booking process', () => {
    it('get for all products, a test product should exist', async () => {
      const retVal = await app.searchProducts({
        axios,
        token,
        typeDefsAndQueries,
      });
      expect(Array.isArray(retVal.products)).toBeTruthy();
      // console.log(retVal.products.filter(({ productName }) => productName === testProduct.productName));
      expect(retVal.products).toContainObject([{
        productName: testProduct.productName,
      }]);
      testProduct = {
        ...retVal.products.find(({ productName }) => productName === testProduct.productName),
      };
      expect(testProduct.productId).toBeTruthy();
    });
    it('should be able to get a single product', async () => {
      const retVal = await app.searchProducts({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          productId: testProduct.productId,
        },
      });
      expect(Array.isArray(retVal.products)).toBeTruthy();
      expect(retVal.products).toHaveLength(1);
    });
    let busProducts = [];
    it('should be able to get a product by name', async () => {
      const retVal = await app.searchProducts({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          productName: '*Sydney Classic*',
        },
      });
      expect(Array.isArray(retVal.products)).toBeTruthy();
      expect(retVal.products.length).toBeGreaterThan(0);
      busProducts = retVal.products;
    });
    it('should be able to get an availability calendar', async () => {
      const retVal = await app.availabilityCalendar({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          startDate: moment().add(1, 'days').format(dateFormat),
          endDate: moment().add(1, 'months').add(2, 'days').format(dateFormat),
          dateFormat,
          productIds: [
            '11'
          ],
        },
      });
      expect(retVal).toBeTruthy();
      const { availability } = retVal;
      expect(availability).toHaveLength(1);
      expect(availability[0].length).toBeGreaterThan(0);
    });
    let availabilityKey;
    it('should be able to get availability', async () => {
      const retVal = await app.searchAvailability({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          startDate: moment().add(1, 'days').format(dateFormat),
          endDate: moment().add(2, 'months').format(dateFormat),
          dateFormat,
          productIds: ['11'],
          optionIds: ["2"],
          units: [[
                    {"unitId":"ADULT","quantity":1}
                  ]
                 ]
        },
      });
      expect(retVal).toBeTruthy();
      const { availability } = retVal;
      expect(availability).toHaveLength(1);
      expect(availability[0].length).toBeGreaterThan(0);
      availabilityKey = R.path([0, 0, 'key'], availability);
      expect(availabilityKey).toBeTruthy();
    });
    let booking;
    const bookingRefId = faker.datatype.uuid();
    it('should be able to create a booking', async () => {
      const fullName = faker.name.findName().split(' ');
      const retVal = await app.createBooking({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          availabilityKey: jwt.sign(({
            productId: 11,
            optionId: 2,
            tourDate: moment().isoWeekday(5).add(14, 'days').format(dateFormatCB),
            // currency,
            unitItems: [
              {
                  "unitId": "ADULT",
                  "noOfPax": "3",
                  "equipments": [
                      {
                          "id": "1001",
                          "count": 1
                      }
                  ]
              }
            ],
          }), process.env.ti2_bonza_jwtKey),
          notes: faker.lorem.paragraph(),
          settlementMethod: 'DEFERRED',
          holder: {
            name: fullName[0],
            surname: fullName[1],
            emailAddress: `engineering+bonzatests_${faker.lorem.slug()}@tourconnect.com`,
            phone: "888888877",
            country: faker.address.countryCode(),
          },
          reference: bookingRefId,
        },
      });
      expect(retVal.booking).toBeTruthy();
      ({ booking } = retVal);
      expect(booking).toBeTruthy();
      expect(R.path(['id'], booking)).toBeTruthy();
      expect(R.path(['supplierBookingId'], booking)).toBeTruthy();
    });
    let bookings = [];
    it('it should be able to search bookings by id', async () => {
      const retVal = await app.searchBooking({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          bookingId: booking.id,
        },
      });
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      ({ bookings } = retVal);
      expect(R.path([0, 'id'], bookings)).toBeTruthy();
    });
    // it('it should be able to search bookings by reference', async () => {
    //   const retVal = await app.searchBooking({
    //     axios,
    //     token,
    //     typeDefsAndQueries,
    //     payload: {
    //       bookingRefId: "TE025660",
    //     },
    //   });
    //   expect(Array.isArray(retVal.bookings)).toBeTruthy();
    //   ({ bookings } = retVal);
    //   expect(R.path([0, 'id'], bookings)).toBeTruthy();
    // });
    it('it should be able to search bookings by supplierBookingId', async () => {
      const retVal = await app.searchBooking({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          bookingRefId: booking.supplierBookingId,
        },
      });
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      ({ bookings } = retVal);
      expect(R.path([0, 'id'], bookings)).toBeTruthy();
    });
    it('it should be able to search bookings by travelDate', async () => {
      const retVal = await app.searchBooking({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          travelDateStart: booking.tourDate,
          travelDateEnd: booking.tourDate,
          dateFormat,
        },
      });
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      ({ bookings } = retVal);
      expect(R.path([0, 'id'], bookings)).toBeTruthy();
    });
    it('should be able to cancel the booking', async () => {
      const retVal = await app.cancelBooking({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          bookingId: booking.id,
          reason: faker.lorem.paragraph(),
        },
      });
      const { cancellation } = retVal;
      expect(cancellation).toBeTruthy();
      expect(R.path(['status'], cancellation)).toBe("Success");
    });
  });
});
