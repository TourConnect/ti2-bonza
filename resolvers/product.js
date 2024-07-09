const constants = require('../utils/constants');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const R = require('ramda');
const { graphql, concatAST } = require('graphql');

const resolvers = {
  Query: {
    productId: R.path(['id']),
    productName: R.path(['internalName']),
    availableCurrencies: root => {
      const result = R.propOr([], 'availableCurrencies', root);
      return R.uniq(result);
    },
    //defaultCurrency: 'AUD', //R.path(['defaultCurrency']),

    options: root => [
      {
        optionId: constants.BOOKING_TYPE.NON_FAMILY,
        optionName: constants.LABELS.NON_FAMILY_LABEL,
        // cancellationCutoff: R.pathOr('', ['cancellationCutoff'], root),
        units: root => [
          {
            unitId: constants.UNIT_IDS.ADULT,
            unitName: constants.LABELS.UNIT_ADULT_LABEL,
            // subtitle: R.pathOr('', ['note']),
            type: R.path('', 'type', root),
            pricing: R.path('pricePerUnit'),
            restrictions: root => {
              if (!root.restrictions) return {};
              if (root.restrictions.minAge === 0 && root.restrictions.maxAge === 99) {
                if (root.reference && extractAndSortNumbers(root.reference)) {
                  const [minAge, maxAge] = extractAndSortNumbers(root.reference);
                  return {
                    // ...root.restrictions,
                    minAge: minAge || 0,
                    maxAge: maxAge || 99,
                  }
                }
              }
              return {};
            },
          },
          {
            unitId: constants.UNIT_IDS.CHILD,
            unitName: constants.LABELS.UNIT_CHILD_LABEL,
            // subtitle: R.pathOr('', ['note']),
            type: R.prop('type'),
            pricing: R.path('pricePerUnit'),
            restrictions: root => {
              if (!root.restrictions) return {};
              if (root.restrictions.minAge === 0 && root.restrictions.maxAge === 99) {
                if (root.reference && extractAndSortNumbers(root.reference)) {
                  const [minAge, maxAge] = extractAndSortNumbers(root.reference);
                  return {
                    // ...root.restrictions,
                    minAge: minAge || 0,
                    maxAge: maxAge || 99,
                  }
                }
              }
              return {};
            },
          },
          {
            unitId: constants.UNIT_IDS.INFANT,
            unitName: constants.LABELS.UNIT_INFANT_LABEL,
            // subtitle: R.pathOr('', ['note']),
            type: R.prop('type'),
            pricing: R.path('pricePerUnit'),
            restrictions: root => {
              if (!root.restrictions) return {};
              if (root.restrictions.minAge === 0 && root.restrictions.maxAge === 99) {
                if (root.reference && extractAndSortNumbers(root.reference)) {
                  const [minAge, maxAge] = extractAndSortNumbers(root.reference);
                  return {
                    // ...root.restrictions,
                    minAge: minAge || 0,
                    maxAge: maxAge || 99,
                  }
                }
              }
              return {};
            },
          },
        ]
      },
      {
        optionId: constants.BOOKING_TYPE.FAMILY,
        optionName: constants.LABELS.FAMILY_LABEL,
        units: root => [
          {
            unitId: constants.UNIT_IDS.FAMILY,
            unitName: constants.LABELS.UNIT_FAMILY_GROUP_LABEL,
            // subtitle: R.pathOr('', ['note']),
            type: R.prop('type'),
            pricing: R.path('pricePerUnit'),
            restrictions: root => {
              if (!root.restrictions) return {};
              if (root.restrictions.minAge === 0 && root.restrictions.maxAge === 99) {
                if (root.reference && extractAndSortNumbers(root.reference)) {
                  const [minAge, maxAge] = extractAndSortNumbers(root.reference);
                  return {
                    //// ...root.restrictions,
                    minAge: minAge || 0,
                    maxAge: maxAge || 99,
                  }
                }
              }
              return {};
            },
          },
          {
            unitId: constants.UNIT_IDS.FAMILY_ADD_ADULT,
            unitName: constants.LABELS.UNIT_FAMILY_GROUP_ADD_ADULT_LABEL,
            // subtitle: R.pathOr('', ['note']),
            type: R.prop('type'),
            pricing: R.path('pricePerUnit'),
            restrictions: root => {
              if (!root.restrictions) return {};
              if (root.restrictions.minAge === 0 && root.restrictions.maxAge === 99) {
                if (root.reference && extractAndSortNumbers(root.reference)) {
                  const [minAge, maxAge] = extractAndSortNumbers(root.reference);
                  return {
                    //// ...root.restrictions,
                    minAge: minAge || 0,
                    maxAge: maxAge || 99,
                  }
                }
              }
              return {};
            },
          },
          {
            unitId: constants.UNIT_IDS.FAMILY_ADD_CHILD,
            unitName: constants.LABELS.UNIT_FAMILY_GROUP_ADD_CHILD_LABEL,
            // subtitle: R.pathOr('', ['note']),
            type: R.prop('type'),
            pricing: R.path('pricePerUnit'),
            restrictions: root => {
              if (!root.restrictions) return {};
              if (root.restrictions.minAge === 0 && root.restrictions.maxAge === 99) {
                if (root.reference && extractAndSortNumbers(root.reference)) {
                  const [minAge, maxAge] = extractAndSortNumbers(root.reference);
                  return {
                    // ...root.restrictions,
                    minAge: minAge || 0,
                    maxAge: maxAge || 99,
                  }
                }
              }
              return {};
            },
          },
          {
            unitId: constants.UNIT_IDS.INFANT,
            unitName: constants.LABELS.UNIT_INFANT_LABEL,
            // subtitle: R.pathOr('', ['note']),
            type: R.prop('type'),
            pricing: R.path('pricePerUnit'),
            restrictions: root => {
              if (!root.restrictions) return {};
              if (root.restrictions.minAge === 0 && root.restrictions.maxAge === 99) {
                if (root.reference && extractAndSortNumbers(root.reference)) {
                  const [minAge, maxAge] = extractAndSortNumbers(root.reference);
                  return {
                    // ...root.restrictions,
                    minAge: minAge || 0,
                    maxAge: maxAge || 99,
                  }
                }
              }
              return {};
            },
          },
        ]
      },
    ]
  },
};

const translateProduct = async ({
  rootValue,
  typeDefs,
  query,
}) => {
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  const retVal = await graphql({
    schema,
    rootValue,
    source: query,
  });
  if (retVal.errors) throw new Error(retVal.errors);
  return retVal.data;
};

module.exports = {
  translateProduct,
};
