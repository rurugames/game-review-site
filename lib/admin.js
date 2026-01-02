const ADMIN_DISPLAY_NAMES = Object.freeze({
  'hiderance1919@gmail.com': 'R18Hub',
  'hepujima@gmail.com': 'ruruGamesJP',
});

function getAdminDisplayNameByEmail(email) {
  if (!email) return null;
  return ADMIN_DISPLAY_NAMES[String(email)] || null;
}

function isAdminEmail(email) {
  return !!getAdminDisplayNameByEmail(email);
}

module.exports = {
  ADMIN_DISPLAY_NAMES,
  getAdminDisplayNameByEmail,
  isAdminEmail,
};
