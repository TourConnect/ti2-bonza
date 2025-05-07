const { makeExecutableSchema } = require('@graphql-tools/schema');
const { graphql } = require('graphql');
const R = require('ramda');
const jwt = require('jsonwebtoken');

const resolvers = {
  Query: {
    key: (root, args) => {
      const {
        productId,
        // unitItems,
        optionId,
        // currency,
        unitsWithQuantity,
        jwtKey,
      } = args;

      console.log("jwtKey : " + jwtKey);
      console.log("root : " + JSON.stringify(root));
      if (!jwtKey) return null;
      if (root.status !== 'AVAILABLE' && root.status !== 'FREESALE') return null;
      return jwt.sign(({
        productId,
        optionId,
        tourDate: R.path(['localDate'], root),
        // currency,
        unitItems: R.chain(u => {
          return new Array(u.quantity).fill(1).map(() => ({
            unitId: u.unitId,
            noOfPax: u.quantity
          }));
        }, unitsWithQuantity),
      }), jwtKey);
    },
    // dateTimeStart: root => R.path(['localDateTimeStart'], root) || R.path(['localDate'], root),
    dateTimeStart: root => R.path(['localDate'], root),
    
    // There is NO end time but duration - if this is required field can add to start time 
    // and find out, but the duration is not sent in the API as yet
    dateTimeEnd: root => R.path(['localDateTimeEnd'], root) || R.path(['localDate'], root),

    // allDay: R.path(['allDay']),
    vacancies: R.prop('vacancies'),
    // capacity: R.prop('capacity'),
    available: avail => Boolean(avail.status === 'AVAILABLE' || avail.status === 'FREESALE'),
    // get the starting price
    pricing: root => ({}),
    unitPricing: root => ([]),
    pickupAvailable: R.prop('pickupAvailable'),
    pickupRequired: R.prop('pickupRequired'),
    pickupPoints: root => R.pathOr([], ['pickupPoints'], root)
      .map(o => ({
        ...o,
        postal: o.postal_code,
      })),
  },
  // TODO: Delete
  // Pricing: {
  //   unitId: R.prop('unitId'),
  //   original: R.prop('original'),
  //   retail: R.prop('retail'),
  //   net: R.prop('net'),
  //   currencyPrecision: R.prop('currencyPrecision'),
  // },
};

const translateAvailability = async ({ rootValue, variableValues, typeDefs, query }) => {
  console.log("translateAvailability called");
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  })
  const retVal = await graphql({
    schema,
    rootValue,
    source: query,
    variableValues,
  });
  if (retVal.errors) throw new Error(retVal.errors);
  return retVal.data;
};
module.exports = {
  translateAvailability,
};
