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
    // defaultCurrency: R.path(['defaultCurrency']),
    options: R.propOr([], 'options'),
  },
  Option: {
    optionId: R.prop('id'),
    optionName: R.prop('internalName'),
    units: R.propOr([], ['units']),
  },
  Unit: {
    unitId: R.path(['id']),
    unitName: R.pathOr('', ['internalName']),
    // subtitle: R.pathOr('', ['note']),
    type: R.prop('type'),
    pricing: R.path('pricePerUnit'),
    restrictions: root => {
      if (!root.restrictions) return {};
      if (root.restrictions.minAge === 0 && root.restrictions.maxAge === 99) {
        if (root.reference && extractAndSortNumbers(root.reference)) {
          const [minAge, maxAge] = extractAndSortNumbers(root.reference);
          return {
            ...root.restrictions,
            minAge: minAge || 0,
            maxAge: maxAge || 99,
          }
        }
      }
      return {};
    },
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
