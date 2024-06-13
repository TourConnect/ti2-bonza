const { makeExecutableSchema } = require('@graphql-tools/schema');
const R = require('ramda');
const { graphql } = require('graphql');

const capitalize = sParam => {
  if (typeof sParam !== 'string') return '';
  const s = sParam.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};
const isNilOrEmptyArray = el => {
  if (!Array.isArray(el)) return true;
  return R.isNil(el) || R.isEmpty(el);
};

const resolvers = {
  Query: {
    id: R.path(['id']),
    orderId: R.pathOr('', ['uuid']),
    bookingId: R.pathOr('', ['id']),
    // not defined in schema?
    // bookingPartnerId: R.path(['bookingPartnerId']),
    supplierBookingId: R.path(['bookingRefID']),
    status: e => capitalize(R.path(['status'], e)),
    productId: R.path(['product', 'id']),
    productName: R.path(['product', 'internalName']),
    cancellable: root => {
      if (root.status === 'CANCELED') return false;
      return root.cancellable;
    },
    editable: () => false,
    unitItems: ({ unitItems = [] }) => unitItems.map(unitItem => ({
      unitItemId: R.path(['unitId'], unitItem),
      unitName: R.path(['unitId'], unitItem),
      // Here we have to show noOfPax!
      unitId: R.path(['noOfPax'], unitItem),
    })),
    // start: R.path(['availability', 'localDateTimeStart']),
    start: R.path(['utcCreatedAt']),
    end: R.path(['utcCreatedAt']),
    // end: R.path(['availability', 'localDateTimeStart']),
    // allDay: false,
    bookingDate: R.path(['utcCreatedAt']),
    holder: root => ({
      name: R.pathOr('', ['travelerFirstname'], root),
      surname: R.pathOr('', ['travelerLastname'], root),
      fullName: R.pathOr('', ['travelerFirstname'], root) + " " + R.pathOr('', ['travelerLastname'], root),
      phoneNumber: R.pathOr('', ['phone'], root),
      emailAddress: R.pathOr('', ['email'], root),
    }),
    // notes: R.pathOr('', ['notes']),
    price: root => ({
      //original: R.path(['pricing', 'original'], root),
      retail:R.pathOr('', ['totalNet'], root),
      // currencyPrecision: 2,
      currency: "AUD", //R.path(['pricing', 'currency'], root),
    }),
    cancelPolicy: root => {
      const cancellationCutoff = R.pathOr('', ['product', 'options', 'cancellationCutoff'], root);
      if (cancellationCutoff) return `Cancel before ${cancellationCutoff} of departure time.`;
      return '';
    },
    // optionId: R.path(['optionId']),
    // optionName: ({ option }) => option ? option.internalName : '',
    // resellerReference: R.propOr('', 'id'),
    privateUrl: root => {
      // return `https://bmsstage.bonzabiketours.com/purchases/edit-tour/57411`
      return `https://bmsstage.bonzabiketours.com/purchases/edit-tour/${root.id}`
    },
  },
};


const translateBooking = async ({ rootValue, typeDefs, query }) => {
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
  translateBooking,
};
