// Locale for date rendering, kept in sync with the UI language by App.jsx.
// Helpers read it at call time so every page formats dates in the active language.
let currentLocale = "fr-FR";

export function setDateLocale(code) {
  currentLocale = code || "fr-FR";
}

export function getDateLocale() {
  return currentLocale;
}
