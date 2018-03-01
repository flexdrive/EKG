const micro = require('micro')
const visualize = require('micro-visualize')
const Joi = require('joi')
const {
  default: EKG,
  httpGetCheck,
  dnsResolveCheck,
  tcpDialCheck,
  mongoDBCheck,
} = require('./')

const printHelp = () => {
  console.log(
    `Invalid Configuration, example configuration
{
  "port": 3000,
  "livenessChecks": [
    {
      "name": "http-check-localhost",
      "type": "httpGetCheck",
      "url": "http://localhost",
      "timeout": 5000
    }
  ],
  "readynessChecks": [
    {
      "name": "dns-check-buffer",
      "type": "dnsResolveCheck",
      "host": "api.bufferapp.com",
      "timeout": 5000
    }
  ]
}
`,
  )
}

const bail = () => {
  printHelp()
  process.exit(1)
}

const timeoutSchema = Joi.number()
  .min(1)
  .max(60 * 1000)

const httpGetCheckSchema = Joi.object().keys({
  type: Joi.string()
    .valid('httpGetCheck')
    .required(),
  name: Joi.string().required(),
  url: Joi.string().required(),
  timeout: timeoutSchema,
})

const dnsResolveCheckSchema = Joi.object().keys({
  type: Joi.string()
    .valid('dnsResolveCheck')
    .required(),
  name: Joi.string().required(),
  host: Joi.string().required(),
  timeout: timeoutSchema,
})

const tcpDialCheckSchema = Joi.object().keys({
  type: Joi.string()
    .valid('tcpDialCheck')
    .required(),
  name: Joi.string().required(),
  host: Joi.string().required(),
  port: Joi.number().required(),
  timeout: timeoutSchema,
})

const mongoDBCheckSchema = Joi.object().keys({
  type: Joi.string()
    .valid('mongoDBCheck')
    .required(),
  name: Joi.string().required(),
  host: Joi.string().required(),
  port: Joi.number().required(),
  dbName: Joi.number().required(),
  timeout: timeoutSchema,
})

const schema = Joi.object()
  .keys({
    port: Joi.number().required(),
    livenessChecks: Joi.array()
      .items(
        httpGetCheckSchema,
        dnsResolveCheckSchema,
        tcpDialCheckSchema,
        mongoDBCheckSchema,
      )
      .unique(),
    readynessChecks: Joi.array()
      .items(
        httpGetCheckSchema,
        dnsResolveCheckSchema,
        tcpDialCheckSchema,
        mongoDBCheckSchema,
      )
      .unique(),
  })
  .or('livenessChecks', 'readynessChecks')

const generateCheckFunction = ({ check }) => {
  switch (check.type) {
    case 'httpGetCheck':
      return httpGetCheck({
        url: check.url,
        timeout: check.timeout,
      })
    case 'dnsResolveCheck':
      return dnsResolveCheck({
        host: check.host,
        timeout: check.timeout,
      })
    case 'tcpDialCheck':
      return tcpDialCheck({
        host: check.host,
        port: check.port,
        timeout: check.timeout,
      })
    case 'mongoDBCheck':
      return mongoDBCheck({
        host: check.host,
        port: check.port,
        dbName: check.dbName,
        timeout: check.timeout,
      })
    default:
      console.error('this should not happen :D')
      bail()
  }
}

const main = async () => {
  let config
  try {
    config = JSON.parse(process.env.EKG_CONFIG)
  } catch (err) {
    console.error('EKG_CONFIG environment variable missing')
    process.exit(1)
  }

  try {
    await Joi.validate(config, schema, { abortEarly: false })
  } catch (error) {
    console.error(JSON.stringify(error.details, null, 2))
    bail()
  }

  const ekg = new EKG()
  if (config.livenessChecks) {
    config.livenessChecks.forEach(check =>
      ekg.addLivenessCheck({
        check: generateCheckFunction({ check }),
        name: check.name,
      }),
    )
  }

  if (config.readynessChecks) {
    config.readynessChecks.forEach(check =>
      ekg.addReadynessCheck({
        check: generateCheckFunction({ check }),
        name: check.name,
      }),
    )
  }
  const server = micro(visualize(ekg.handler))
  server.listen(config.port, () =>
    console.log(`listening on port ${config.port}`),
  )
}

main()
