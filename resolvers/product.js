const { makeExecutableSchema } = require('@graphql-tools/schema');
const R = require('ramda');
const { graphql } = require('graphql');

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
        optionId: "1",
        optionName: 'Non-Family',
        // cancellationCutoff: R.pathOr('', ['cancellationCutoff'], root),
        units: root => [
          {
            unitId: "ADULT",
            unitName: "Adult",
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
            unitId: "CHILD",
            unitName: "Child",
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
            unitId: "INFANT",
            unitName: "Infant",
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
        optionId: "2",
        optionName: 'Family',
        units: root => [
          {
            unitId: "FAMILY_GROUPS",
            unitName: "Family Groups",
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
            unitId: "ADD_ADULT",
            unitName: "Additional Adult",
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
            unitId: "ADD_CHILD",
            unitName: "Additional Child",
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
            unitId: "FAMILY_INFANT",
            unitName: "Infant",
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
