// Run every test in the French time zone so that daylight-saving rules are exercised
// the same way on every machine (the user's phone is in Europe/Paris by default).
module.exports = async () => {
  process.env.TZ = 'Europe/Paris';
};
