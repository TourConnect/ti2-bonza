const R = require('ramda');
const Promise = require('bluebird');
const assert = require('assert');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const wildcardMatch = require('./utils/wildcardMatch');
const { translateProduct } = require('./resolvers/product');
const { translateAvailability } = require('./resolvers/availability');
const { translateBooking } = require('./resolvers/booking');

// const endpoint = 'https://bmsstage.bonzabiketours.com:3001/octo/v1/';

const CONCURRENCY = 3; // is this ok ?

const isNilOrEmpty = R.either(R.isNil, R.isEmpty);

const getHeaders = ({
  apiKey,
}) => ({
  //TODO: REPLACE If Necessary
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
});

class Plugin {
  constructor(params) { // we get the env variables from here
    Object.entries(params).forEach(([attr, value]) => {
      this[attr] = value;
    });
    this.tokenTemplate = () => ({
      //TODO: REPLACE If Necessary
      // In your system apiKey (or whatever token(s) you choose to use) should represent which reseller is sending the requests
      // and the requests are sent via TourConnect
      // apiKey: {
      //   type: 'text',
      //   regExp: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
      //   description: 'the Api Key generated from Bonza for a reseller, should be in uuid format',
      // },
      bookingPartnerId: {
        type: 'text',
        regExp: /^\d+$/,
        description: 'The booking partner id',
      }
    });
  }

  async validateToken({
    axios,
    token: {
      bookingPartnerId,
    },
    }) 
    {
    const url = `${this.endpoint}/products`;
    const headers = getHeaders({
      apiKey:this.apiKey,
    });
    try {
      const suppliers = R.path(['data'], await axios({
        method: 'get',
        url,
        headers,
      }));
      return Array.isArray(suppliers) && suppliers.length > 0;
    } catch (err) {
      console.log("ERR: " + err);
      return false;
    }
  }

  async searchProducts({
    axios,
    token: {
      bookingPartnerId,
    },
    payload,
    typeDefsAndQueries: {
      productTypeDefs,
      productQuery,
    },
  }) {
    let url = `${this.endpoint}/products`;
    console.log("URL: " + url);
    if (!isNilOrEmpty(payload)) {
      if (payload.productId) {
        console.log("payload.productId: " + payload.productId);
        url = `${url}/${payload.productId}`;
      }
    }

    console.log("URL: " + url);
    const headers = getHeaders({
      apiKey: this.apiKey,
    });
    let results = R.pathOr([], ['data'], await axios({
      method: 'get',
      url,
      headers,
    }));
    if (!Array.isArray(results)) results = [results];
    let products = await Promise.map(results, async product => {
      return translateProduct({
        rootValue: product,
        typeDefs: productTypeDefs,
        query: productQuery,
      });
    });
    console.log("dynamic extra filtering");
    // dynamic extra filtering
    if (!isNilOrEmpty(payload)) {
      const extraFilters = R.omit(['productId'], payload);
      if (Object.keys(extraFilters).length > 0) {
        products = products.filter(
          product => Object.entries(extraFilters).every(
            ([key, value]) => {
              if (typeof value === 'string') return wildcardMatch(value, product[key]);
              return true;
            },
          ),
        );
      }
    }
    return ({ products });
  }

  async searchQuote({
    token: {
      bookingPartnerId,
    },
    payload: {
      productIds,
      optionIds,
    },
  }) {
    return { quote: [] };
  }

  async searchAvailability({
    axios,
    token: {
      bookingPartnerId,
    },
    // ONLY add payload key when absolutely necessary
    payload: {
      productIds,
      startDate,
      endDate,
      dateFormat,
      units
    },
    typeDefsAndQueries: {
      availTypeDefs,
      availQuery,
    },
  }) {
    assert(this.jwtKey, 'JWT secret should be set');
    assert(
      productIds.length === productIds.length,
      'mismatched productIds/options length',
    );
    // assert(
    //   optionIds.length === units.length,
    //   'mismatched options/units length',
    // );
    assert(productIds.every(Boolean), 'some invalid productId(s)');
    // assert(optionIds.every(Boolean), 'some invalid optionId(s)');
    console.log("START DATE BEFORE: " + startDate);
    let todayDate = Date.now();
    if (Date(startDate) < todayDate) {
      startDate = todayDate.toString();
    }
    console.log("START DATE AFTER: " + startDate);
    const localDateStart = moment(startDate, dateFormat).format('YYYY-MM-DD');
    const localDateEnd = moment(endDate, dateFormat).format('YYYY-MM-DD');
    const headers = getHeaders({
      apiKey: this.apiKey,
    });

    const url = `${this.endpoint}/availability/calendar`;
    let availability = (
      await Promise.map(productIds, async (productId, ix) => {
        const data = {
          productId,
          localDateStart,
          localDateEnd,
        };
        return R.path(['data'], await axios({
          method: 'get',
          url,
          data,
          headers,
        }));
      }, { concurrency: CONCURRENCY })
    );
    availability = await Promise.map(availability,
      (avails, ix) => {
        return Promise.map(avails,
          avail => translateAvailability({
            typeDefs: availTypeDefs,
            query: availQuery,
            rootValue: avail,
            variableValues: {
              productId: productIds[ix],
              // optionId: optionIds[ix],
              // currency,
              unitsWithQuantity: units[ix],
              jwtKey: this.jwtKey,
            },
          }),
        );
      },
    );
    return { availability };
  }

  async availabilityCalendar({
    axios,
    token: {
      bookingPartnerId,
    },
    // ONLY add payload key when absolutely necessary
    payload: {
      productIds,
      startDate,
      endDate,
      dateFormat,
      units
    },
    typeDefsAndQueries: {
      availTypeDefs,
      availQuery,
    },
  }) {
    try {
      assert(this.jwtKey, 'JWT secret should be set');
      assert(
        productIds.length === productIds.length,
        'mismatched productIds/options length',
      );
      // assert(
      //   optionIds.length === units.length,
      //   'mismatched options/units length',
      // );
      assert(productIds.every(Boolean), 'some invalid productId(s)');
      // assert(optionIds.every(Boolean), 'some invalid optionId(s)');
      console.log("AC: START DATE BEFORE: " + startDate);
      let todayDate = moment(new Date(), dateFormat).format('YYYY-MM-DD');
      startDate = moment(startDate, dateFormat).format('YYYY-MM-DD');
      console.log("AC: TodayDATE: " + todayDate.toString());
      console.log("AC: startDate: " + startDate.toString());
      if (startDate < todayDate) {
        startDate = todayDate.toString();
      }
      console.log("AC: START DATE AFTER: " + startDate);
  
      const localDateStart = startDate;
      const localDateEnd = moment(endDate, dateFormat).format('YYYY-MM-DD');
      const headers = getHeaders({
        apiKey: this.apiKey,
      });
      
      const url = `${this.endpoint}/availability/calendar`;
      const availability = (
        await Promise.map(productIds, async (productId, ix) => {
          const data = {
            productId,
            // optionId: optionIds[ix],
            localDateStart,
            localDateEnd,
            // units is required here to get the total pricing for the calendar
            //units: units[ix].map(u => ({ id: u.unitId, quantity: u.quantity })),
          };
          const result = await axios({
            method: 'get',
            url,
            data,
            headers,
          });
          return Promise.map(result.data, avail => translateAvailability({
            rootValue: avail,
            typeDefs: availTypeDefs,
            query: availQuery,
          }))
        }, { concurrency: CONCURRENCY })
      );
      return { availability };
    } catch (err) {
      console.log("ERR: " + err);
      return false;
    }
  }

  async createBooking({
    axios,
    token: {
      bookingPartnerId,
    },
    // ONLY add payload key when absolutely necessary
    payload: {
      availabilityKey,
      holder,
      notes,
      reference,
      customFieldValues
      // settlementMethod,
      // rebookingId : this is for Edit
    },
    token,
    typeDefsAndQueries,
    typeDefsAndQueries: {
      bookingTypeDefs,
      bookingQuery,
    },
  }) {
    assert(availabilityKey, 'an availability code is required !');
    assert(R.path(['name'], holder), 'a holder\' first name is required');
    assert(R.path(['surname'], holder), 'a holder\' surname is required');
    assert(R.path(['emailAddress'], holder), 'a holder\' email is required');

    if (customFieldValues && customFieldValues.length) {

    }

    // const dataForCreateBooking = await jwt.verify(availabilityKey, this.jwtKey);
    // if (customFieldValues && customFieldValues.length) {
    //   const productCFV = customFieldValues.filter(o => !R.isNil(o.value) && !o.field.isPerUnitItem);
    //   const unitItemCFV = customFieldValues.filter(o => !R.isNil(o.value) && o.field.isPerUnitItem);
    //   if (productCFV.length) {
    //     dataForCreateBooking.questionAnswers = productCFV.map(o => ({
    //       questionId: o.field.id,
    //       value: o.value,
    //     }));
    //   }
    //   if (unitItemCFV.length) {
    //     dataForCreateBooking.unitItems = R.call(R.compose(
    //       R.map(arr => ({
    //         unitId: arr[0].field.unitId,
    //         questionAnswers: arr.map(o => ({
    //           questionId: o.field.id.split('|')[0],
    //           value: o.value,
    //         })),
    //       })),
    //       R.values,
    //       R.groupBy(o => {
    //         const [questionId, unitItemIndex] = o.field.id.split('|');
    //         return unitItemIndex;
    //       }),
    //     ), unitItemCFV);
    //   }
    // }

    // TODO: assert validations for equipment


    const headers = getHeaders({
      apiKey: this.apiKey,
    });
    
    const urlForCreateBooking = `${this.endpoint}/bookings`;
    const dataFromAvailKey = await jwt.verify(availabilityKey, this.jwtKey);
    let booking = R.path(['data'], await axios({
      method: 'post',
      url: urlForCreateBooking,
      data: {
        // settlementMethod, 
        travelerFirstname: `${holder.name}`,
        travelerLastname: `${holder.surname}`,
        email: R.path(['emailAddress'], holder),
        phone: R.pathOr('', ['phone'], holder),
        ...R.omit(['iat', 'currency'], dataFromAvailKey),
        // notes,
      },
      headers,
    }));
    const dataForConfirmBooking = {
      // locales: R.pathOr(null, ['locales'], holder),
      // country: R.pathOr('', ['country'], holder),
      paymentType: "Invoice",
      bookingPartnerId: bookingPartnerId,
      bookingRefID: reference,
      sendEmailToPartner: 0,
      sendEmailToGuest: 1
      // settlementMethod,
    };
    booking = R.path(['data'], await axios({
      method: 'post',
      url: `${this.endpoint}/bookings/${booking.orderUUID}/confirm`,
      data: dataForConfirmBooking,
      headers,
    }));
    // TODO: Call get booking here
    const { products: [product] } = await this.searchProducts({
      axios,
      typeDefsAndQueries,
      token,
      payload: {
        productId: dataFromAvailKey.productId,
      }
    });
    return ({
      booking: await translateBooking({
        rootValue: {
          ...booking,
          product,  // this is NOT requied
          // option: product.options.find(o => o.optionId === dataFromAvailKey.optionId),
        },
        typeDefs: bookingTypeDefs,
        query: bookingQuery,
      })
    });
  }

  async cancelBooking({
    axios,
    token: {
      bookingPartnerId,
    },
    // ONLY add payload key when absolutely necessary
    payload: {
      bookingId,
      id,
      reason,
    },
    typeDefsAndQueries,
    token,
    typeDefsAndQueries: {
      bookingTypeDefs,
      bookingQuery,
    },
  }) {
    assert(!isNilOrEmpty(bookingId) || !isNilOrEmpty(id), 'Invalid booking id');
    const headers = getHeaders({
      apiKey: this.apiKey,
    });
    //TODO: CHANGE If Necessary
    const url = `${this.endpoint}/bookings/${bookingId || id}`;
    const booking = R.path(['data'], await axios({
      method: 'delete',
      url,
      //TODO: CHANGE If Necessary
      data: { reason },
      headers,
    }));
    const { products: [product] } = await this.searchProducts({
      axios,
      typeDefsAndQueries,
      token,
      payload: {
        productId: booking.productId,
      }
    });
    return ({
      cancellation: await translateBooking({
        rootValue: {
          ...booking,
          product,
          option: product.options.find(o => o.optionId === booking.optionId),
        },
        typeDefs: bookingTypeDefs,
        query: bookingQuery,
      })
    });
  }

  async searchBooking({
    axios,
    token: {
      bookingPartnerId,
    },
    // ONLY add payload key when absolutely necessary
    payload: {
      bookingId,
      travelDateStart,
      travelDateEnd,
      dateFormat,
    },
    typeDefsAndQueries,
    token,
    typeDefsAndQueries: {
      bookingTypeDefs,
      bookingQuery,
    },
  }) {
    assert(
      !isNilOrEmpty(bookingId)
      || !(
        isNilOrEmpty(travelDateStart) && isNilOrEmpty(travelDateEnd) && isNilOrEmpty(dateFormat)
      ),
      'at least one parameter is required',
    );
    const headers = getHeaders({
      apiKey: this.apiKey,
    });
    const searchByUrl = async url => {
      try {
        return R.path(['data'], await axios({
          method: 'get',
          url,
          headers,
        }));
      } catch (err) {
        return [];
      }
    };
    const bookings = await (async () => {
      let url;
      if (!isNilOrEmpty(bookingId)) {
        //TODO: REPLACE If Necessary
        return Promise.all([
          searchByUrl(`${this.endpoint}/bookings/${bookingId}`),
          // searchByUrl(`${this.endpoint}/bookings?resellerReference=${bookingId}`),
          // searchByUrl(`${this.endpoint}/bookings?supplierReference=${bookingId}`),
        ]);
      }
      if (!isNilOrEmpty(travelDateStart)) {
        const localDateStart = moment(travelDateStart, dateFormat).format('YYYY-MM-DD');
        const localDateEnd = moment(travelDateEnd, dateFormat).format('YYYY-MM-DD');
        //TODO: REPLACE If Necessary
        url = `${this.endpoint}/bookings?tourDateFrom=${encodeURIComponent(localDateStart)}&tourDateTo=${encodeURIComponent(localDateEnd)}`;
        return R.path(['data'], await axios({
          method: 'get',
          url,
          headers,
        }));
      }
      return [];
    })();
    return ({
      bookings: await Promise.map(R.unnest(bookings), async booking => {
        // const { products: [product] } = await this.searchProducts({
        //   axios,
        //   typeDefsAndQueries,
        //   token,
        //   payload: {
        //     productId: booking.productId,
        //   }
        // });
        return translateBooking({
          rootValue: {
            ...booking,
            // product,
            // option: product.options.find(o => o.optionId === booking.optionId),
          },
          typeDefs: bookingTypeDefs,
          query: bookingQuery,
        });
      })
    });
  }

  async getCreateBookingFields({
    axios,
    token: {
      apiKey,
      endpoint,
      octoEnv,
      acceptLanguage,
      resellerId,
    },
    query: {
      productId,
      selection,
      date,
      dateFormat
    },
  }) {
    const headers = getHeaders({
      apiKey: this.apiKey,
      endpoint,
      octoEnv,
      acceptLanguage,
      resellerId,
    });

    console.log("productId : " +  productId); 
    console.log("date : " +  date); 
    console.log("dateFormat : " +  dateFormat); 
    
    // selection : [{"unitId":"ADULT","quantity":1},{"unitId":"CHILD"},{"unitId":"INFANT"}]
    let selectedUnits = JSON.parse(selection);
    // console.log("JSON: " + JSON.stringify(selectedUnits));
    // console.log("Len: " + selectedUnits);
    // console.log("Len: " + selectedUnits.length);

    let customFieldsToShow = [];

    // const getEquipmentField = (id, name) => {
    //   customFieldsToShow.push ({
    //     id: id,
    //     title: `${name} Required`,
    //     subtitle: 'Select the equipment you need',
    //     type: 'yes-no',
    //     isPerUnitItem: false,
    //   })
    // }

    const getEquipmentCountField = (id, name) => {
      customFieldsToShow.push ({
        id: id,
        title: `Enter ${name} Required`,
        subtitle: 'Enter the equipment you need',
        type: 'count',
        isPerUnitItem: false,
      })
    }

    const getAdultEquipmentFields = () => {
      // getEquipmentField("EBIKE", "e-Bike(s)");
      getEquipmentCountField("EBIKE_COUNT", "e-Bike(s)");
    }

    const getChildEquipmentFields = () => {
      // getEquipmentField("TRAILALONGS", "Trail Alongs(s)");
      getEquipmentCountField("TRAILALONGS_COUNT", "Trail Alongs(s)");
      // getEquipmentField("KIDDIECARRIER", "Kiddie Carrier(s)");
      getEquipmentCountField("KIDDIECARRIER_COUNT", "Kiddie Carrier(s)");
      // getEquipmentField("SMALLKIDSBIKE", "Small Kids Bike(s)");
      getEquipmentCountField("SMALLKIDSBIKE_COUNT", "Small Kids Bike(s)");
      // getEquipmentField("LARGEKIDSBIKE", "Large Kids Bike(s)");
      getEquipmentCountField("LARGEKIDSBIKE_COUNT", "Large Kids Bike(s)");
    }

    const getInfantEquipmentFields = () => {
      // getEquipmentField("BABYSEATS", "Baby Seat(s)");
      getEquipmentCountField("BABYSEATS_COUNT", "Baby Seat(s)");
    }
    
    selectedUnits.forEach(function (unit, d) {
      // console.log('%d: %s', i, value);
      console.log('unit.unitId: ', unit.unitId);
      console.log('unit.quantity: ', unit.quantity);

      switch (unit.unitId.toString().trim()) {
        case "ADULT":
          console.log("inside ADULT loop");
          getAdultEquipmentFields();
          break;
        case "CHILD":
          console.log("inside CHILD loop");
          if (unit.quantity == undefined) {
            return {
              fields: [],
              customFields: []
            };
          }
          getChildEquipmentFields();
          break;
        case "INFANT":
        case "FAMILY_INFANT":
          console.log("inside INFANT loop");
          if (unit.quantity == undefined) {
            return {
              fields: [],
              customFields: []
            };
          }
          getInfantEquipmentFields();
          break;
        case "FAMILY_GROUPS":
          console.log("inside FAMILY loop");
          // Family is 2 Adults and 2 Childred
          getAdultEquipmentFields();
          getChildEquipmentFields();
          break;
      };
    })

    console.log("customFieldsToShow : " + customFieldsToShow.toString());

    return {
      fields: [],
      customFields: customFieldsToShow
    }
    // TODO: Check if we can filter the list based on the UNIT
    // return {
    //   fields: [],
    //   customFields: [{
    //     id: '4444',
    //     title: 'Equipment',
    //     subtitle: 'Select the equipment you need',
    //     type: 'extended-option',
    //     options: [
    //         { value: '1', label: 'e-Bikes (Adult Only)' },
    //         { value: '2', label: 'Baby Seats (Infants Only)' },
    //         { value: '3', label: 'Trail Alongs' },
    //         { value: '4', label: 'Kiddie Carriers' },
    //         { value: '5', label: 'Small Kids Bikes' },
    //         { value: '6', label: 'Large Kids Bikes' },
    //     ],
    //     isPerUnitItem: true,
    //   }],
    // }
  }
}

module.exports = Plugin;
