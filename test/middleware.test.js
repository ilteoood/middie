'use strict'

// Original Fastify test/middlewares.test.js file

const test = require('node:test')
const fastify = require('fastify')
const fp = require('fastify-plugin')
const cors = require('cors')
const helmet = require('helmet')
const fs = require('node:fs')

const middiePlugin = require('../index')

test('use a middleware', async (t) => {
  t.plan(6)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      const useRes = instance.use(function (_req, _res, next) {
        t.assert.ok('middleware called')
        next()
      })

      t.assert.strictEqual(useRes, instance)
    })

  instance.get('/', function (_request, reply) {
    reply.send({ hello: 'world' })
  })

  const fastifyServerAddress = await instance.listen({ port: 0 })

  t.after(() => instance.server.close())

  const response = await fetch(fastifyServerAddress)

  t.assert.strictEqual(response.status, 200)
  t.assert.strictEqual(response.headers.get('content-length'), '' + (await response.text()).length)

  const secondResponse = await fetch(fastifyServerAddress, {
    method: 'GET'
  })
  const body = await secondResponse.json()
  t.assert.deepStrictEqual(body, { hello: 'world' })
})

test('use cors', async (t) => {
  t.plan(2)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(cors())
    })

  instance.get('/', function (_request, reply) {
    reply.send({ hello: 'world' })
  })

  const fastifyServerAddress = await instance.listen({ port: 0 })

  t.after(() => instance.server.close())

  const response = await fetch(fastifyServerAddress)

  t.assert.ok(response.ok)
  t.assert.strictEqual(response.headers.get('access-control-allow-origin'), '*')
})

test('use helmet', async (t) => {
  t.plan(2)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(helmet())
    })

  instance.get('/', function (_request, reply) {
    reply.send({ hello: 'world' })
  })

  const fastifyServerAddress = await instance.listen({ port: 0 })

  t.after(() => instance.server.close())

  const response = await fetch(fastifyServerAddress)

  t.assert.ok(response.ok)
  t.assert.ok(response.headers.get('x-xss-protection'))
})

test('use helmet and cors', async (t) => {
  t.plan(3)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(cors())
      instance.use(helmet())
    })

  instance.get('/', function (_request, reply) {
    reply.send({ hello: 'world' })
  })

  const fastifyServerAddress = await instance.listen({ port: 0 })

  t.after(() => instance.server.close())

  const response = await fetch(fastifyServerAddress)

  t.assert.ok(response.ok)
  t.assert.ok(response.headers.get('x-xss-protection'))
  t.assert.strictEqual(response.headers.get('access-control-allow-origin'), '*')
})

test('middlewares with prefix', async t => {
  t.plan(4)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (req, _res, next) {
        req.global = true
        next()
      })
      instance.use('', function (req, _res, next) {
        req.global2 = true
        next()
      })
      instance.use('/', function (req, _res, next) {
        req.root = true
        next()
      })
      instance.use('/prefix', function (req, _res, next) {
        req.prefixed = true
        next()
      })
      instance.use('/prefix/', function (req, _res, next) {
        req.slashed = true
        next()
      })
    })

  function handler (request, reply) {
    reply.send({
      prefixed: request.raw.prefixed,
      slashed: request.raw.slashed,
      global: request.raw.global,
      global2: request.raw.global2,
      root: request.raw.root
    })
  }

  instance.get('/', handler)
  instance.get('/prefix', handler)
  instance.get('/prefix/', handler)
  instance.get('/prefix/inner', handler)

  const fastifyServerAddress = await instance.listen({ port: 0 })
  t.after(() => instance.server.close())

  await t.test('/', async (t) => {
    t.plan(2)
    const response = await fetch(fastifyServerAddress)
    t.assert.ok(response.ok)
    const body = await response.json()
    t.assert.deepStrictEqual(body, {
      global: true,
      global2: true,
      root: true
    })
  })

  await t.test('/prefix', async (t) => {
    t.plan(2)
    const response = await fetch(fastifyServerAddress + '/prefix')
    t.assert.ok(response.ok)
    const body = await response.json()
    t.assert.deepStrictEqual(body, {
      prefixed: true,
      global: true,
      global2: true,
      root: true,
      slashed: true
    })
  })

  await t.test('/prefix/', async (t) => {
    t.plan(2)
    const response = await fetch(fastifyServerAddress + '/prefix/')
    t.assert.ok(response.ok)
    const body = await response.json()
    t.assert.deepStrictEqual(body, {
      prefixed: true,
      slashed: true,
      global: true,
      global2: true,
      root: true
    })
  })

  await t.test('/prefix/inner', async (t) => {
    t.plan(2)
    const response = await fetch(fastifyServerAddress + '/prefix/inner')
    t.assert.ok(response.ok)
    const body = await response.json()
    t.assert.deepStrictEqual(body, {
      prefixed: true,
      slashed: true,
      global: true,
      global2: true,
      root: true
    })
  })
})

test('res.end should block middleware execution', (t, done) => {
  t.plan(4)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (_req, res, _next) {
        res.end('hello')
      })

      instance.use(function () {
        t.assert.fail('we should not be here')
      })
    })

  instance.addHook('onRequest', (_req, _res, next) => {
    t.assert.ok('called')
    next()
  })

  instance.addHook('preHandler', (_req, _reply, _next) => {
    t.assert.fail('this should not be called')
  })

  instance.addHook('onSend', (_req, _reply, _payload, _next) => {
    t.assert.fail('this should not be called')
  })

  instance.addHook('onResponse', (_request, _reply, next) => {
    t.assert.ok('called')
    next()
  })

  instance.get('/', function () {
    t.assert.fail('we should no be here')
  })

  instance.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(res.payload, 'hello')
    done()
  })
})

test('middlewares should be able to respond with a stream', (t, done) => {
  t.plan(4)

  const instance = fastify()

  instance.addHook('onRequest', (_req, _res, next) => {
    t.assert.ok('called')
    next()
  })

  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (_req, res, next) {
        const stream = fs.createReadStream(process.cwd() + '/test/middleware.test.js', 'utf8')
        stream.pipe(res)
        res.once('finish', next)
      })

      instance.use(function () {
        t.assert.fail('we should not be here')
      })
    })

  instance.addHook('preHandler', () => {
    t.assert.fail('this should not be called')
  })

  instance.addHook('onSend', () => {
    t.assert.fail('this should not be called')
  })

  instance.addHook('onResponse', (_request, _reply, next) => {
    t.assert.ok('called')
    next()
  })

  instance.get('/', function () {
    t.assert.fail('we should no be here')
  })

  instance.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 200)
    done()
  })
})

test('Use a middleware inside a plugin after an encapsulated plugin', (t, done) => {
  t.plan(4)
  const f = fastify()
  f.register(middiePlugin)

  f.register(function (instance, _opts, next) {
    instance.use(function (_req, _res, next) {
      t.assert.ok('first middleware called')
      next()
    })

    instance.get('/', function (_request, reply) {
      reply.send({ hello: 'world' })
    })

    next()
  })

  f.register(fp(function (instance, _opts, next) {
    instance.use(function (_req, _res, next) {
      t.ok('second middleware called')
      next()
    })

    next()
  }))

  f.inject('/', (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(JSON.parse(res.payload), { hello: 'world' })
    done()
  })
})

test('middlewares should run in the order in which they are defined', (t, done) => {
  t.plan(9)
  const f = fastify()
  f.register(middiePlugin)

  f.register(fp(function (instance, _opts, next) {
    instance.use(function (req, _res, next) {
      t.assert.strictEqual(req.previous, undefined)
      req.previous = 1
      next()
    })

    instance.register(fp(function (i, _opts, next) {
      i.use(function (req, _res, next) {
        t.assert.strictEqual(req.previous, 2)
        req.previous = 3
        next()
      })
      next()
    }))

    instance.use(function (req, _res, next) {
      t.assert.strictEqual(req.previous, 1)
      req.previous = 2
      next()
    })

    next()
  }))

  f.register(function (instance, _opts, next) {
    instance.use(function (req, _res, next) {
      t.assert.strictEqual(req.previous, 3)
      req.previous = 4
      next()
    })

    instance.get('/', function (request, reply) {
      t.assert.strictEqual(request.raw.previous, 5)
      reply.send({ hello: 'world' })
    })

    instance.register(fp(function (i, _opts, next) {
      i.use(function (req, _res, next) {
        t.assert.strictEqual(req.previous, 4)
        req.previous = 5
        next()
      })
      next()
    }))

    next()
  })

  f.inject('/', (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(JSON.parse(res.payload), { hello: 'world' })
    done()
  })
})
