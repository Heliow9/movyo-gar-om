const fs = require('fs');
const path = require('path');
const base = require('./app.json').expo;

const localGoogleServices = path.join(__dirname, 'google-services.json');
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
  || (fs.existsSync(localGoogleServices) ? './google-services.json' : '');

const plugins = [...(base.plugins || [])];
if (!plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-notifications')) {
  plugins.push([
    'expo-notifications',
    {
      icon: './assets/notification-icon.png',
      color: '#ff3b8a',
      defaultChannel: 'movyo-operacional',
    },
  ]);
}

module.exports = {
  expo: {
    ...base,
    plugins,
    android: {
      ...base.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  },
};
