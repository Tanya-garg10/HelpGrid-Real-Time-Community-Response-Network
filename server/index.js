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
      const devUsers = [{
        uid: env.HELPGRID_DEV_UID,
        password: env.HELPGRID_DEV_PASSWORD,
      }]
      if (env.HELPGRID_DEV_UID_2 || env.HELPGRID_DEV_PASSWORD_2) {
        if (!env.HELPGRID_DEV_UID_2 || !env.HELPGRID_DEV_PASSWORD_2) {
          throw new Error('Configure both HELPGRID_DEV_UID_2 and HELPGRID_DEV_PASSWORD_2 for the second test user.')
        }
        devUsers.push({
          uid: env.HELPGRID_DEV_UID_2,
          password: env.HELPGRID_DEV_PASSWORD_2,
        })
      }

      const app = createApp({
        appId: env.COMETCHAT_APP_ID,
        region: env.COMETCHAT_REGION,
        restApiKey: env.COMETCHAT_REST_API_KEY,
        devUsers,
      })
      app.listen(port, '127.0.0.1', () => {
        console.log(`HelpGrid development API listening at http://127.0.0.1:${port} (${devUsers.length} development user${devUsers.length === 1 ? '' : 's'} configured)`)
      })
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
