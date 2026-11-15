export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: "en-US",
  fallbackWarn: false,
  missingWarn: true,
  datetimeFormats: {
    "en-US": {
      short: {
        dateStyle: "short",
        timeStyle: "short",
      },
      medium: {
        dateStyle: "medium",
        timeStyle: "short",
      },
      time: {
        timeStyle: "medium",
      },
    },
  },
  numberFormats: {
    "en-US": {
      integer: {
        maximumFractionDigits: 0,
      },
    },
  },
}));
