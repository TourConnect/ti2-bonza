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
  endpoint: process.env.ti2_bonza_endpoint,
  jwtKey: process.env.ti2_bonza_jwtKey,
  apiKey: process.env.ti2_bonza_apiKey,
});
const rnd = arr => arr[Math.floor(Math.random() * arr.length)];

describe('search tests', () => {
  let products;
  let testProduct = {
    productId: '11',
    productName: 'Sydney Classic Tour',
  };
  const token = {
    // apiKey: process.env.ti2_bonza_apiKey,
    bookingPartnerId: 181
  };
  const dateFormat = 'DD/MM/YYYY';
  const dateFormatCB = 'YYYY-MM-DD';
  beforeAll(async () => {
    // nada
  });
  describe('utilities', () => {
    describe('validateToken', () => {
      it('valid token', async () => {
        expect(token).toBeTruthy();
        const retVal = await app.validateToken({
          axios,
          token,
        });
        expect(retVal).toBeTruthy();
      });
      // it('invalid token', async () => {
      //   const retVal = await app.validateToken({
      //     axios,
      //     token: { apiKey: 'invalid token' },
      //   });
      //   expect(retVal).toBeFalsy();
      // });
    });
    describe('template tests', () => {
      let template;
      it('get the template', async () => {
        template = await app.tokenTemplate();
        const rules = Object.keys(template);
        expect(rules).toContain('bookingPartnerId');
      });
      it('bookingPartnerId', () => {
        const bookingPartnerId = template.bookingPartnerId.regExp;
        expect(bookingPartnerId.test('something')).toBeFalsy();
        expect(bookingPartnerId.test(token.bookingPartnerId)).toBeTruthy();
      });
    });
  });
  describe('booking process', () => {
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
    const reference = faker.datatype.uuid();
    it('should be able to create a booking', async () => {
      const fullName = faker.name.findName().split(' ');
      const retVal = await app.createBooking({
        axios,
        token: {
          bookingPartnerId: 181
        },
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
          reference,
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
