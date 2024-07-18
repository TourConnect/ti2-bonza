const constants = require('./utils/constants');
const R = require('ramda');
const Promise = require('bluebird');
const assert = require('assert');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const wildcardMatch = require('./utils/wildcardMatch');
const { translateProduct } = require('./resolvers/product');
const { translateAvailability } = require('./resolvers/availability');
const { translateBooking } = require('./resolvers/booking');
const ORIGIN_COUNTRIES =
  `Australia,New Zealand,United Kingdom,U.S. United States,------------------,Albania,Algeria,American Samoa,Andorra,Angola,Anguilla,Antarctica,Antigua And Barbuda,Argentina,Armenia,Aruba,Austria,Azerbaijan,Bahamas,Bahrain,Bangladesh,Barbados,Belarus,Belgium,Belize,Benin,Bermuda,Bhutan,Bolivia,Bosnia and Herzegowina,Botswana,Bouvet Island,Brazil,Brunei Darussalam,Bulgaria,Burkina Faso,Burma,Burundi,Cambodia,Cameroon,Canada,Cape Verde,Cayman Islands,Central African Republic,Chad,Chile,Christmas Island,Cocos (Keeling) Islands,Colombia,Comoros,Congo,Cook Islands,Costa Rica,Cote dIvoire,Croatia,Cyprus,Czech Republic,Denmark,Djibouti,Dominica,Dominican Republic,East Timor,Ecuador,Egypt,El Salvador,England,Equatorial Guinea,Eritrea,Espana,Estonia,Ethiopia,Falkland Islands,Faroe Islands,Fiji,Finland,France,French Guiana,French Polynesia,Gabon,Gambia,Georgia,Germany,Ghana,Gibraltar,Great Britain,Greece,Greenland,Grenada,Guadeloupe,Guam,Guatemala,Guinea,Guinea-Bissau,Guyana,Haiti,Honduras,Hong Kong,Hungary,Iceland,India,Indonesia,Ireland,Israel,Italy,Jamaica,Japan,Jordan,Kazakhstan,Kenya,Kiribati,Korea (South),Korea - Republic of,Kuwait,Kyrgyzstan,Latvia,Lebanon,Lesotho,Liberia,Liechtenstein,Lithuania,Luxembourg,Macau,Macedonia,Madagascar,Malawi,Malaysia,Maldives,Mali,Malta,Marshall Islands,Martinique,Mauritania,Mauritius,Mayotte,Mexico,Moldova - Republic of,Monaco,Mongolia,Montserrat,Morocco,Mozambique,Myanmar,Namibia,Nauru,Nepal,Netherlands,Netherlands Antilles,New Caledonia,Nicaragua,Niger,Nigeria,Niue,Norfolk Island,Northern Ireland,Northern Mariana Islands,Norway,Oman,Pakistan,Palau,Panama,Papua New Guinea,Paraguay,Peru,Philippines,Pitcairn,Poland,Portugal,Puerto Rico,Qatar,Reunion,Romania,Russia,Russian Federation,Rwanda,Saint Kitts and Nevis,Saint Lucia,Samoa (Independent),San Marino,Sao Tome and Principe,Saudi Arabia,Scotland,Senegal,Seychelles,Sierra Leone,Singapore,Slovakia,Slovenia,Solomon Islands,Somalia,South Africa,South Korea,Spain,Sri Lanka,St. Helena,St. Pierre and Miquelon,Suriname,Swaziland,Sweden,Switzerland,Taiwan,Tajikistan,Tanzania,Thailand,Togo,Tokelau,Tonga,Trinidad,Triniad and Tobago,Tunisia,Turkey,Turkmenistan,Tuvalu,Uganda,Ukraine,United Arab Emirates,Uruguay,Uzbekistan,Vanuatu,Venezuela,Viet Nam,Virgin Islands (British),Virgin Islands (U.S.),Wales,Western Sahara,Yemen,Zambia,Zimbabwe`.
  split(`,`,)
const CUSTOM_FIELD_IDS = {
  EBIKE_COUNT: 1,
  BABYSEATS_COUNT: 2,
  TRAILALONGS_COUNT: 3,
  KIDDIECARRIER_COUNT: 4,
  SMALLKIDSBIKE_COUNT: 5,
  LARGEKIDSBIKE_COUNT: 6,
  ORIGINCOUNTRY: 7,
  TRAVELAGENCY: 8,
  FAMILS: 9,
}
const EQUIPMENT_FIELD_IDS = {
  EBIKE: 1001,
  BABYSEATS: 1002,
  TRAILALONGS: 1003,
  KIDDIECARRIER: 1004,
  SMALLKIDSBIKE: 1005,
  LARGEKIDSBIKE: 1006,
}

const CONCURRENCY = 3; // is this ok ?

const isNilOrEmpty = R.either(R.isNil, R.isEmpty);

const getHeaders = ({
  apiKey,
}) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
});

class Plugin {
  constructor(params) { // we get the env variables from here
    Object.entries(params).forEach(([attr, value]) => {
      this[attr] = value;
    });
    this.tokenTemplate = () => ({
      endpoint: {
        type: 'text',
        regExp: /^(?!mailto:)(?:(?:http|https|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?:(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[0-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))|localhost)(?::\d{2,5})?(?:(\/|\?|#)[^\s]*)?$/i,
        default: 'https://bmsstage.bonzabiketours.com:3001/octo/v1',
        description: 'The Bonza API endpoint URL',
      },
      apiKey: {
        type: 'text',
        regExp: /[0-9a-f]{48}/,
        description: 'The authentication key for Bonza API endpoint',
      },
      bookingPartnerId: {
        type: 'text',
        regExp: /^\d+$/,
        description: 'The Bonza booking partner id',
      }
    });
    this.errorPathsAxiosErrors = () => ([ // axios triggered errors
      ['response', 'data', 'errorMessage'],
    ]);
    this.errorPathsAxiosAny = () => ([]); // 200's that should be errors
  }

  async validateToken({
      axios,
      token: {
        endpoint,
        apiKey,
        bookingPartnerId,
      },
    })
    {
      // console.log("API KEY in plugin : " + apiKey);
      // console.log("ENDPOINT in plugin : " + endpoint);
      // console.log("BOOKIGN PARTNER ID in plugin : " + bookingPartnerId);
      const url = `${endpoint}/products`;
      const headers = getHeaders({
        apiKey: apiKey,
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
      endpoint,
      apiKey,
      bookingPartnerId,
  },
    payload,
    typeDefsAndQueries: {
      productTypeDefs,
      productQuery,
    },
  }) {
    let url = `${endpoint}/products`;
    console.log("URL: " + url);
    if (!isNilOrEmpty(payload)) {
      if (payload.productId) {
        console.log("payload.productId: " + payload.productId);
        url = `${url}/${payload.productId}`;
      }
    }

    console.log("URL: " + url);
    const headers = getHeaders({
      apiKey: apiKey,
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

  // async searchQuote({
  //   token: {
  //     endpoint,
  //     apiKey,
  //     bookingPartnerId,
  //   },
  //   payload: {
  //     productIds,
  //     optionIds,
  //   },
  // }) {
  //   return { quote: [] };
  // }

  async searchAvailability({
    axios,
    token: {
      endpoint,
      apiKey,
      bookingPartnerId,
    },
    // ONLY add payload key when absolutely necessary
    payload: {
      productIds,
      optionIds,
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
    assert(
      optionIds.length === units.length,
      'mismatched options/units length',
    );
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
      apiKey: apiKey,
    });

    const url = `${endpoint}/availability/calendar`;
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
              optionId: optionIds[ix],
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
      endpoint,
      apiKey,
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
      console.log("availabilityCalendar called");

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

      // console.log("AC: END DATE: " + localDateEnd);
      const headers = getHeaders({
        apiKey: apiKey,
      });
      
      const url = `${endpoint}/availability/calendar`;
      const availability = (
        await Promise.map(productIds, async (productId, ix) => {
          // console.log("PRODUCT ID: " + productId);
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
      endpoint,
      apiKey,
      bookingPartnerId,
    },
    // ONLY add payload key when absolutely necessary
    payload: {
      availabilityKey,
      holder,
      notes,
      reference,
      customFieldValues,
      // settlementMethod,
      rebookingId
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

    let uiEndPoint = "https://bms.bonzabiketours.com/";
    if (endpoint.includes("bmsstage")) {
      uiEndPoint = "https://bmsstage.bonzabiketours.com/";
    }

    const inputDataForBooking = await jwt.verify(availabilityKey, this.jwtKey);
    console.log("OPTION ID: " + inputDataForBooking.optionId);

    let isFamilyBooking = false;
    if (constants.BOOKING_TYPE.FAMILY == inputDataForBooking.optionId) {
      isFamilyBooking = true;
    }
    console.log("Family Booking: " + isFamilyBooking);

    // Get Equipment Details
    console.log("customFieldValues: " + JSON.stringify(customFieldValues));
    // Example:
    // [
    // {"field":{"id":7,"title":"Entry Origin Country","subtitle":"Enter the traveler's country of origin",
    //      "type":"short","isPerUnitItem":false},"value":"USA"},
    // {"field":{"id":8,"title":"Entry Travel Agency","subtitle":"Enter the travel agency name",
    //      "type":"short","isPerUnitItem":false},"value":"BONZA PARTNER USA"}
    // {"field":{"id":9,"title":"Is it Famil?","subtitle":"Entry whether this is a famil booking",
    //      "type":"yes-no","isPerUnitItem":false},"value":false}
    // {"field":{"id":"EBIKE_COUNT","title":"Enter e-Bike(s) Required","subtitle":"Enter the equipment you need",
    //       "type":"count","isPerUnitItem":false},"value":"1"},
    // {"field":{"id":"TRAILALONGS_COUNT","title":"Enter Trail Alongs(s) Required","subtitle":"Enter the equipment you need",
    //      "type":"count","isPerUnitItem":false},"value":"2"},
    // {"field":{"id":"KIDDIECARRIER_COUNT","title":"Enter Kiddie Carrier(s) Required","subtitle":"Enter the equipment you need",
    //      "type":"count","isPerUnitItem":false},"value":"3"},
    // {"field":{"id":"SMALLKIDSBIKE_COUNT","title":"Enter Small Kids Bike(s) Required","subtitle":"Enter the equipment you need",
    //      "type":"count","isPerUnitItem":false},"value":"4"},
    //{"field":{"id":"LARGEKIDSBIKE_COUNT","title":"Enter Large Kids Bike(s) Required","subtitle":"Enter the equipment you need",
    //      "type":"count","isPerUnitItem":false},"value":"5"},
    // {"field":{"id":"BABYSEATS_COUNT","title":"Enter Baby Seat(s) Required", "subtitle":"Enter the equipment you need",
    //      "type":"count","isPerUnitItem":false},"value":"6"}
    // ]

    let eBikeCount = 0;
    let babySeatCount = 0;
    let kiddieCarrierCount = 0;
    let trailAlongsCount = 0;
    let smallKidsBikeCount = 0;
    let largeKidsBikeCount = 0;
    let adult_equipment = [];
    let kid_equipments = [];
    let infant_equipment = [];

    let originCountry = "";
    let travelAgency = "";
    let famils = 0;

    if (customFieldValues && customFieldValues.length) {
      console.log("Len: " + customFieldValues.length);

      customFieldValues.forEach(function (unit, d) {
        console.log('unit.value: ', unit.value);
        switch(parseInt(unit.field.id)) {
          case CUSTOM_FIELD_IDS.ORIGINCOUNTRY:
            originCountry = !isNilOrEmpty(unit.value) ? unit.value : "";
          break;
          case CUSTOM_FIELD_IDS.TRAVELAGENCY:
            travelAgency = !isNilOrEmpty(unit.value) ? unit.value : "";
          break;
          case CUSTOM_FIELD_IDS.FAMILS:
            let booleanFamils = !isNilOrEmpty(unit.value) ? unit.value : "";
            famils = booleanFamils === true ? 1 : 0;
          break;
        }
      })

      const unitItemCFV = customFieldValues.filter(o => (!R.isNil(o.value) && (o.value > 0) && !o.field.isPerUnitItem)); 
      console.log("unitItemCFV: " + JSON.stringify(unitItemCFV));

      unitItemCFV.forEach(function (unit, d) {
        console.log('unit.field: ', unit.field.title);
        let count = parseInt(unit.value);
        console.log('Count : ', count);

        switch(parseInt(unit.field.id)) {
          case CUSTOM_FIELD_IDS.EBIKE_COUNT:
            eBikeCount = count;
            adult_equipment.push({
              id : EQUIPMENT_FIELD_IDS.EBIKE,
              count: count
            });
            break;
          case CUSTOM_FIELD_IDS.BABYSEATS_COUNT:
            babySeatCount = count;
            infant_equipment.push({
              id : EQUIPMENT_FIELD_IDS.BABYSEATS,
              count: count
            });
            break;
          case CUSTOM_FIELD_IDS.KIDDIECARRIER_COUNT:
            kiddieCarrierCount = count;
            kid_equipments.push ({
              id : EQUIPMENT_FIELD_IDS.KIDDIECARRIER,
              count: count
            });
            break;
          case CUSTOM_FIELD_IDS.TRAILALONGS_COUNT:
            trailAlongsCount = count;
            kid_equipments.push ({
              id : EQUIPMENT_FIELD_IDS.TRAILALONGS,
              count: count
            });
            break;
          case CUSTOM_FIELD_IDS.SMALLKIDSBIKE_COUNT:
            smallKidsBikeCount = count;
            kid_equipments.push ({
              id : EQUIPMENT_FIELD_IDS.SMALLKIDSBIKE,
              count: count
            });
            break;
          case CUSTOM_FIELD_IDS.LARGEKIDSBIKE_COUNT:
            largeKidsBikeCount = count;
            kid_equipments.push ({
              id : EQUIPMENT_FIELD_IDS.LARGEKIDSBIKE,
              count: count
            });
            break;
        }
      })
    }

    // SAMPLE value of inputDataForBooking
    console.log("inputDataForBooking: " + JSON.stringify(inputDataForBooking));
    // {"productId":"11","tourDate":"2024-06-21",
    console.log("BEFORE UPDATE unitItems : " + JSON.stringify(inputDataForBooking.unitItems));
    // NOTE: Remember that unitItems return DUPLICATES as shown below. Example:
    // [{"unitId":"ADULT","noOfPax":1},{"unitId":"CHILD","noOfPax":4},{"unitId":"CHILD","noOfPax":4},
    // {"unitId":"CHILD","noOfPax":4},{"unitId":"CHILD","noOfPax":4},{"unitId":"INFANT","noOfPax":1}]

    // Remove duplicates
    const uniqueUnitItems = inputDataForBooking.unitItems.filter((obj1, i, arr) => 
      arr.findIndex(obj2 => (obj2.unitId === obj1.unitId)) === i
    )
    console.log("uniqueUnitItems : " + JSON.stringify(uniqueUnitItems));

    let noOfAdults = 0;
    let noOfChildren = 0;
    let noOfInfants = 0;
    let noOfAdditionalPax = {};
    let familyUnit = {};
    
    // Get Pax Count and also update family & equipments
    uniqueUnitItems.map(unitItem => {
      let paxCount = parseInt(R.path(['noOfPax'], unitItem));
      let unitId = String(R.path(['unitId'], unitItem));
    
      console.log("unitItem: " + JSON.stringify(unitItem));
      console.log("unitId: " + unitId);
      console.log("Pax Count: " + paxCount);
      
      switch (unitId) {
        case constants.UNIT_IDS.ADULT:
          noOfAdults =  paxCount;
          console.log('adult_equipment : ', adult_equipment);
          unitItem.equipments = adult_equipment;
          break;
        case constants.UNIT_IDS.CHILD:
          noOfChildren =  paxCount;
          unitItem.equipments = kid_equipments;
          break;
        case constants.UNIT_IDS.INFANT:
          noOfInfants =  paxCount;
          unitItem.equipments = infant_equipment;
          // Family Booking Related
          noOfAdditionalPax.noOfBabies = paxCount;
          break;
        case constants.UNIT_IDS.FAMILY:
            noOfAdults +=  paxCount * 2;
            noOfChildren += paxCount * 2;
            familyUnit.unitId = unitId;
            familyUnit.noOfPax = paxCount;
            break;
        case constants.UNIT_IDS.FAMILY_ADD_ADULT:
          noOfAdults +=  paxCount;
          noOfAdditionalPax.noOfAdditionalAdults = paxCount;
          break;
        case constants.UNIT_IDS.FAMILY_ADD_CHILD:
          noOfChildren +=  paxCount;
          noOfAdditionalPax.noOfAdditionalChildren = paxCount;
          break;
      }
    });

    // Assert validations for equipment
    if (noOfAdults < eBikeCount) {
      assert('','e-Bikes are only available for adults at this time. The number of e-bikes you have added to the booking exceed the number of adults in the booking.');
    }
    if (noOfInfants < babySeatCount) {
      assert('',"baby seats are only available for Infants at this time. The number of baby seats you add to the booking can't be more than the number of infants in the booking.");
    }
    if (noOfChildren < (kiddieCarrierCount + trailAlongsCount + smallKidsBikeCount + largeKidsBikeCount)) {
      assert('',"kids equipments are only available for kids at this time. The number of kid equipments you add to the booking can't be more than the number of kids (excluding infants) in the booking.");
    }

    // Input data validated, including equipment count. proceed to create the booking
    let dataForBooking = {};
    dataForBooking.productId = inputDataForBooking.productId;
    dataForBooking.tourDate = inputDataForBooking.tourDate;
    dataForBooking.originCountry = originCountry;
    dataForBooking.travelAgency = travelAgency;
    dataForBooking.famils = famils;

    if (isFamilyBooking) {
      // add additional pax
      familyUnit.noOfAdditionalPax = noOfAdditionalPax;

      // add family equipments
      console.log("adult_equipment : " + JSON.stringify(adult_equipment));
      console.log("kid_equipments : " + JSON.stringify(kid_equipments));
      console.log("infant_equipment : " + JSON.stringify(infant_equipment));
      familyUnit.equipments = adult_equipment.concat(kid_equipments, infant_equipment);

      // add family units
      console.log("familyUnit : " + JSON.stringify(familyUnit));
      dataForBooking.unitItems = [familyUnit];
    } else {
      dataForBooking.unitItems = uniqueUnitItems;
    }

    console.log("AFTER UPDATE (data for create booking) : " + JSON.stringify(dataForBooking));

    const headers = getHeaders({
      apiKey: apiKey,
    });
  
    const urlForCreateBooking = `${endpoint}/bookings`;
    let booking = R.path(['data'], await axios({
      method: 'post',
      url: urlForCreateBooking,
      data: {
        // settlementMethod, 
        travelerFirstname: `${holder.name}`,
        travelerLastname: `${holder.surname}`,
        email: R.path(['emailAddress'], holder),
        phone: R.pathOr('', ['phone'], holder),
        ...R.omit(['iat', 'currency'], dataForBooking),
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
      url: `${endpoint}/bookings/${booking.orderUUID}/confirm`,
      data: dataForConfirmBooking,
      headers,
    }));
    
    // console.log("booking: " + JSON.stringify(booking));

    // console.log("uiEndPoint: " + uiEndPoint);
    // Get the booking
    let newBooking = R.path(['data'], await axios({
      method: 'get',
      url: `${endpoint}/bookings/${booking.id}`,
      data: dataForConfirmBooking,
      headers,
    }));
    return ({
      booking: await translateBooking({
        rootValue: {
          ...newBooking,
          uiEndPoint
        },
        typeDefs: bookingTypeDefs,
        query: bookingQuery,
      })
    });
  }

  async cancelBooking({
    axios,
    token: {
      endpoint,
      apiKey,
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
      apiKey: apiKey,
    });
    const url = `${endpoint}/bookings/${bookingId || id}/cancel`;
    const booking = R.path(['data'], await axios({
      method: 'post',
      url,
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
      endpoint,
      apiKey,
      bookingPartnerId,
    },
    // ONLY add payload key when absolutely necessary
    payload: {
      bookingRefId,
      bookingId,
      name,
      purchaseDateStart,
      purchaseDateEnd,
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
      ||  !isNilOrEmpty(bookingRefId)
      ||  !isNilOrEmpty(name)
      ||  !(isNilOrEmpty(travelDateStart) && isNilOrEmpty(travelDateEnd) && isNilOrEmpty(dateFormat))
      ||  !(isNilOrEmpty(purchaseDateStart) && isNilOrEmpty(purchaseDateEnd) && isNilOrEmpty(dateFormat)),
          'at least one parameter is required',
    );

    const headers = getHeaders({
      apiKey: apiKey,
    });

    let uiEndPoint = "https://bms.bonzabiketours.com/";
    if (endpoint.includes("bmsstage")) {
      uiEndPoint = "https://bmsstage.bonzabiketours.com/";
    }

    const bookingsFound = await (async () => {
      if (!isNilOrEmpty(bookingId)) {
        console.log("BookingID: calling search by URL");
        let url = `${endpoint}/bookings/${bookingId}`;
        return [R.path(['data'], await axios({
            method: 'get',
            url,
            headers,
          }))]
      } else if (!isNilOrEmpty(bookingRefId)) {
        console.log("BookingRefId: calling search by Booking Ref ID");
        let url = `${endpoint}/bookings?bookingRefId=${bookingRefId}`;
        return R.path(['data', 'bookings'], await axios({
          method: 'get',
          url,
          headers,
        }));
      } else {
        let url = `${endpoint}/bookings?`;
        let lastNameFilter = false;
        let travelDateFilter = false;
        if (!isNilOrEmpty(name)) {
          console.log("Name: calling search by URL");
          url += `lastName=${name}`;
          lastNameFilter = true;
        }
        
        // console.log("travelDateStart: [" + travelDateStart + "]");
        // console.log("travelDateEnd: [" + travelDateEnd + "]");
        // console.log("purchaseDateStart: [" + purchaseDateStart + "]");
        // console.log("purchaseDateEnd: [" + purchaseDateEnd + "]");
        // console.log("dateFormat: [" + dateFormat + "]");

        if (!(isNilOrEmpty(travelDateStart) && isNilOrEmpty(travelDateEnd)) && !isNilOrEmpty(dateFormat)) {
          const localDateStart = moment(travelDateStart, dateFormat).format('YYYY-MM-DD');
          const localDateEnd = moment(travelDateEnd, dateFormat).format('YYYY-MM-DD');
          console.log("TravelDate: calling search by URL");
          travelDateFilter = true;
          if (lastNameFilter && !isNilOrEmpty(localDateStart) && !isNilOrEmpty(localDateEnd)) {
            url += `&tourDateFrom=${encodeURIComponent(localDateStart)}&tourDateTo=${encodeURIComponent(localDateEnd)}`
          } else {
            url += `tourDateFrom=${encodeURIComponent(localDateStart)}&tourDateTo=${encodeURIComponent(localDateEnd)}`;
          }
        }
        
        if (!(isNilOrEmpty(purchaseDateStart) && isNilOrEmpty(purchaseDateEnd)) && !isNilOrEmpty(dateFormat)) {
          const localDateStart = moment(purchaseDateStart, dateFormat).format('YYYY-MM-DD');
          const localDateEnd = moment(purchaseDateEnd, dateFormat).format('YYYY-MM-DD');
          console.log("PurchaseDate: calling search by URL");
          if (lastNameFilter || travelDateFilter) {
            url += `&purchaseDateFrom=${encodeURIComponent(localDateStart)}&purchaseDateTo=${encodeURIComponent(localDateEnd)}`;
          }
          else {
            url += `purchaseDateFrom=${encodeURIComponent(localDateStart)}&purchaseDateTo=${encodeURIComponent(localDateEnd)}`;
          }
        }
        return R.path(['data', 'bookings'], await axios({
            method: 'get',
            url,
            headers,
        }));
      }
    })();
    return (
      console.log("bookingsFound: " + JSON.stringify(bookingsFound)),
      {
      bookings: await Promise.map(bookingsFound, async booking => {
        console.log("booking raw: " + JSON.stringify(booking));
          return translateBooking({
            rootValue: {
              ...booking,
              uiEndPoint
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
      endpoint,
      apiKey,
      bookingPartnerId,
      octoEnv,
      acceptLanguage,
      resellerId,
    },
    query: {
      productId,
      unitsSelected,
      date,
      dateFormat
    },
  }) {
    const headers = getHeaders({
      apiKey: apiKey,
      endpoint,
      octoEnv,
      acceptLanguage,
      resellerId,
    });

    const addCustomField = (id, title, subtitle, type) => {
      customFieldsToShow.push ({
        id: id,
        title: title,
        subtitle: subtitle,
        type: type,
        isPerUnitItem: false,
      })
    }

    const getEquipmentCountField = (id, name) => {
      customFieldsToShow.push ({
        id: id,
        title: `Enter ${name}(s) Required`,
        subtitle: 'Enter the number of equipment(s) you need',
        // TODO (Sachin): This has to be an option with max value based on inventory
        type: 'count',
        isPerUnitItem: false,
      })
    }

    const getAdultEquipmentFields = () => {
      getEquipmentCountField(CUSTOM_FIELD_IDS.EBIKE_COUNT, constants.LABELS.EBIKE);
    }

    const getChildEquipmentFields = () => {
      getEquipmentCountField(CUSTOM_FIELD_IDS.TRAILALONGS_COUNT, constants.LABELS.TRAIL_ALONG);
      getEquipmentCountField(CUSTOM_FIELD_IDS.KIDDIECARRIER_COUNT, constants.LABELS.KIDDIE_CARRIER);
      getEquipmentCountField(CUSTOM_FIELD_IDS.SMALLKIDSBIKE_COUNT, constants.LABELS.SMALL_KIDS_BIKE);
      getEquipmentCountField(CUSTOM_FIELD_IDS.LARGEKIDSBIKE_COUNT, constants.LABELS.LARGE_KIDS_BIKE);
    }

    const getInfantEquipmentFields = () => {
      getEquipmentCountField(CUSTOM_FIELD_IDS.BABYSEATS_COUNT, constants.LABELS.BABY_SEAT);
    }

    console.log("productId : " +  productId); 
    console.log("date : " +  date); 
    console.log("dateFormat : " +  dateFormat); 
    
    // EXAMPLE: 
    // unitsSelected : [{"unitId":"ADULT","quantity":1},{"unitId":"CHILD"},{"unitId":"INFANT"}]
    let selectedUnits = JSON.parse(unitsSelected);
    console.log("Selected Units: " + JSON.stringify(selectedUnits));
    console.log("Len: " + selectedUnits.length);

    let customFieldsToShow = [];
    // The custom field's type. Supported types: yes-no, short, long, count, and extended-option.

    customFieldsToShow.push ({
      id: CUSTOM_FIELD_IDS.ORIGINCOUNTRY,
      title: "Entry Origin Country",
      subtitle: "Enter the traveler's country of origin",
      type: "extended-option",
      isPerUnitItem: false,
      options: ORIGIN_COUNTRIES,
    })

    addCustomField(CUSTOM_FIELD_IDS.TRAVELAGENCY, "Entry Travel Agency", "Enter the travel agency name", "short");
    addCustomField(CUSTOM_FIELD_IDS.FAMILS, "Is it famils booking?", "Entry whether this is a famil booking", "yes-no");

    selectedUnits.forEach(function (unit, d) {
      console.log('unit.unitId: ', String(unit.unitId));
      console.log('unit.quantity: ', unit.quantity);

      switch (String(unit.unitId)) {
        case constants.UNIT_IDS.ADULT:
          getAdultEquipmentFields();
          break;
        case constants.UNIT_IDS.CHILD:
          if (unit.quantity == undefined) {
            return {
              fields: [],
              customFields: []
            };
          }
          getChildEquipmentFields();
          break;
        case constants.UNIT_IDS.INFANT:
          if (unit.quantity == undefined) {
            return {
              fields: [],
              customFields: []
            };
          }
          getInfantEquipmentFields();
          break;
        case constants.UNIT_IDS.FAMILY:
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
  }
}

module.exports = Plugin;
