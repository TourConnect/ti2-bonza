const UNIT_IDS = {
  ADULT: "ADULT",
  CHILD: "CHILD",
  INFANT: "INFANT",
  FAMILY: "FAMILY",
  FAMILY_ADD_ADULT: "FAMILY_ADD_ADULT",
  FAMILY_ADD_CHILD: "FAMILY_ADD_CHILD",
}
const BOOKING_TYPE = {
  FAMILY: 1,
  NON_FAMILY: 2,
}

const LABELS = {
  // Booking type
  NON_FAMILY_LABEL: "Non-Family",
  FAMILY_LABEL: "Family",
  // Unit
  UNIT_ADULT_LABEL: "Adult",
  UNIT_CHILD_LABEL: "Child",
  UNIT_INFANT_LABEL: "Infant",
  UNIT_FAMILY_GROUP_LABEL: "Family Groups",
  UNIT_FAMILY_GROUP_ADD_ADULT_LABEL: "Additional Adult",
  UNIT_FAMILY_GROUP_ADD_CHILD_LABEL: "Additional Child",
  // Equipment
  EBIKE: "e-Bike",
  BABY_SEAT: "Baby Seat",
  TRAIL_ALONG: "Trail Along",
  KIDDIE_CARRIER: "Kiddie Carrier",
  SMALL_KIDS_BIKE: "Small Kids Bike",
  LARGE_KIDS_BIKE: "Large Kids Bike",
}

module.exports = {UNIT_IDS, BOOKING_TYPE, LABELS};