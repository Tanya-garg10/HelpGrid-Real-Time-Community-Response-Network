import { createApp } from './app.js'

const { env } = process

if (env.NODE_ENV === 'production' || env.HELPGRID_ENABLE_DEV_AUTH !== 'true') {
  console.error('The HelpGrid development token API is localhost-only and cannot run in production.')
  process.exitCode = 1
} else {
  const port = Number(env.PORT || 3001)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT must be an integer between 1 and 65535.')
    process.exitCode = 1
  } else {
    try {
      const app = createApp({
        appId: env.COMETCHAT_APP_ID,
        region: env.COMETCHAT_REGION,
        restApiKey: env.COMETCHAT_REST_API_KEY,
        devUid: env.HELPGRID_DEV_UID,
        devPassword: env.HELPGRID_DEV_PASSWORD,
      })
      app.listen(port, '127.0.0.1', () => {
        console.log(`HelpGrid development API listening at http://127.0.0.1:${port}`)
      })
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
