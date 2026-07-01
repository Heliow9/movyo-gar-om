const fs = require('fs');
const path = require('path');

const localGoogleServices = path.join(__dirname, 'google-services.json');
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
  || (fs.existsSync(localGoogleServices) ? './google-services.json' : '');

module.exports = ({ config }) => {
  const plugins = [...(config.plugins || [])];
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

  return {
    ...config,
    plugins,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
